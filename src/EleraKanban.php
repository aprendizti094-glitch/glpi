<?php

/**
 * Elera Kanban Helper for GLPI
 */
class EleraKanban
{
    /**
     * Get tickets grouped by status for the Elera Kanban board with filter support
     * @param array|null $searchParams
     * @return array
     */
    public static function getData(?array $searchParams = null): array
    {
        global $DB;

        // 1. Resolve criteria from passed parameter, $_GET, or $_SESSION
        $criteria = [];
        if (!empty($searchParams) && isset($searchParams['criteria']) && is_array($searchParams['criteria'])) {
            $criteria = $searchParams['criteria'];
        } elseif (isset($_GET['criteria']) && is_array($_GET['criteria'])) {
            $criteria = $_GET['criteria'];
        } elseif (isset($_SESSION['glpisearch']['Ticket']['criteria']) && is_array($_SESSION['glpisearch']['Ticket']['criteria'])) {
            $criteria = $_SESSION['glpisearch']['Ticket']['criteria'];
        }

        $myUserId = (int)Session::getLoginUserID();
        if ($myUserId <= 0 && isset($_SESSION['glpiID'])) {
            $myUserId = (int)$_SESSION['glpiID'];
        }

        $where = [
            'glpi_tickets.is_deleted' => 0
        ];

        // 2. Parse search criteria to filter Kanban tickets
        foreach ($criteria as $crit) {
            if (!isset($crit['field'])) {
                continue;
            }
            $field = (int)$crit['field'];
            $value = $crit['value'] ?? '';

            // Field 5: Technician, Field 4: Requester, Field 22: Recipient, Field 60: Actor ("Meus chamados")
            if (in_array($field, [4, 5, 22, 60])) {
                if ($value === 'myself' || (is_numeric($value) && (int)$value === $myUserId)) {
                    // "Meus chamados": matches tickets where user is requester, technician, observer or recipient
                    $where[] = "(
                        glpi_tickets.id IN (
                            SELECT tickets_id FROM glpi_tickets_users 
                            WHERE users_id = {$myUserId}
                        )
                        OR glpi_tickets.users_id_recipient = {$myUserId}
                    )";
                } elseif (is_numeric($value) && (int)$value > 0) {
                    $uid = (int)$value;
                    if ($field === 5) {
                        $where[] = "glpi_tickets.id IN (
                            SELECT tickets_id FROM glpi_tickets_users 
                            WHERE users_id = {$uid} AND type = " . CommonITILActor::ASSIGN . "
                        )";
                    } elseif ($field === 4) {
                        $where[] = "glpi_tickets.id IN (
                            SELECT tickets_id FROM glpi_tickets_users 
                            WHERE users_id = {$uid} AND type = " . CommonITILActor::REQUESTER . "
                        )";
                    } elseif ($field === 22) {
                        $where['glpi_tickets.users_id_recipient'] = $uid;
                    }
                }
            }

            // Field 12: Ticket Status
            elseif ($field === 12) {
                if ($value === 'all') {
                    // All tickets: no status restriction
                } elseif ($value === 'notold') {
                    $where[] = "glpi_tickets.status NOT IN (" . CommonITILObject::SOLVED . ", " . CommonITILObject::CLOSED . ")";
                } elseif ($value === 'old') {
                    $where[] = "glpi_tickets.status IN (" . CommonITILObject::SOLVED . ", " . CommonITILObject::CLOSED . ")";
                } elseif ($value === 'process') {
                    $where[] = "glpi_tickets.status IN (" . CommonITILObject::ASSIGNED . ", " . CommonITILObject::PLANNED . ")";
                } elseif (is_numeric($value) && (int)$value > 0) {
                    $where['glpi_tickets.status'] = (int)$value;
                }
            }

            // Field 1: Title / Content search query
            elseif ($field === 1 && !empty($value)) {
                $escaped = $DB->escape(trim($value));
                $where[] = "(glpi_tickets.name LIKE '%{$escaped}%' OR glpi_tickets.content LIKE '%{$escaped}%' OR glpi_tickets.id = " . (int)$value . ")";
            }

            // Field 7: Category
            elseif ($field === 7 && is_numeric($value) && (int)$value > 0) {
                $where['glpi_tickets.itilcategories_id'] = (int)$value;
            }
        }

        $iterator = $DB->request([
            'SELECT' => [
                'glpi_tickets.id',
                'glpi_tickets.name',
                'glpi_tickets.content',
                'glpi_tickets.status',
                'glpi_tickets.priority',
                'glpi_tickets.urgency',
                'glpi_tickets.impact',
                'glpi_tickets.date',
                'glpi_tickets.date_mod',
                'glpi_tickets.users_id_recipient',
                'glpi_itilcategories.completename as category',
            ],
            'FROM' => 'glpi_tickets',
            'LEFT JOIN' => [
                'glpi_itilcategories' => [
                    'FKEY' => [
                        'glpi_tickets' => 'itilcategories_id',
                        'glpi_itilcategories' => 'id'
                    ]
                ]
            ],
            'WHERE' => $where,
            'ORDER' => 'glpi_tickets.date_mod DESC',
            'LIMIT' => 150
        ]);

        $columns = [
            2 => [
                'id' => 2,
                'name' => 'Em Atendimento',
                'alias' => 'Triagem',
                'code' => 'triage',
                'target' => 'meta 10m',
                'color' => '#F59E0B',
                'tickets' => []
            ],
            3 => [
                'id' => 3,
                'name' => 'Planejados',
                'alias' => 'Em Execução',
                'code' => 'treatment',
                'target' => 'méd 32m',
                'color' => '#8B5CF6',
                'tickets' => []
            ],
            4 => [
                'id' => 4,
                'name' => 'Pendentes',
                'alias' => 'Aguardando',
                'code' => 'waiting',
                'target' => 'méd 2h',
                'color' => '#EC4899',
                'tickets' => []
            ],
            5 => [
                'id' => 5,
                'name' => 'Solucionados',
                'alias' => 'Concluídos',
                'code' => 'solved',
                'target' => 'hoje',
                'color' => '#10B981',
                'tickets' => []
            ],
        ];

        $colors = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'];

        foreach ($iterator as $ticket) {
            $status = (int)$ticket['status'];
            if ($status == 1) { // Chamados novos entram diretamente na Triagem
                $status = 2;
            }
            if ($status == 6) { // Fechado agrupa com Solucionados
                $status = 5;
            }
            if (!isset($columns[$status])) {
                continue;
            }

            // Requester
            $user_name = 'Solicitante';
            if ($ticket['users_id_recipient']) {
                $u = new User();
                if ($u->getFromDB($ticket['users_id_recipient'])) {
                    $user_name = $u->getFriendlyName();
                }
            }
            $ticket['requester'] = $user_name;

            // Initial for avatar
            $initial = mb_strtoupper(mb_substr($user_name, 0, 1, 'UTF-8'), 'UTF-8');
            $ticket['avatar_initial'] = $initial ?: 'U';
            $ticket['avatar_bg'] = $colors[abs(crc32($user_name)) % count($colors)];

            // Category clean
            $cat = $ticket['category'] ?? '';
            if ($cat) {
                $cat_parts = explode(' > ', $cat);
                $ticket['category_short'] = end($cat_parts);
            } else {
                $ticket['category_short'] = 'Geral';
            }

            // Technician (User)
            $tech_name = '';
            $tech_user_id = 0;
            $tech_title = '';
            $tech_iterator = $DB->request([
                'SELECT' => ['users_id'],
                'FROM' => 'glpi_tickets_users',
                'WHERE' => [
                    'tickets_id' => $ticket['id'],
                    'type' => CommonITILActor::ASSIGN
                ],
                'LIMIT' => 1
            ]);
            foreach ($tech_iterator as $tu) {
                $tech_user_id = (int)$tu['users_id'];
                $tech = new User();
                if ($tech->getFromDB($tech_user_id)) {
                    $fname = trim($tech->fields['firstname'] ?? '');
                    $rname = trim($tech->fields['realname'] ?? '');
                    if (!empty($fname) && !empty($rname)) {
                        $tech_name = (stripos($fname, $rname) !== false) ? $fname : "$fname $rname";
                    } else {
                        $tech_name = !empty($fname) ? $fname : (!empty($rname) ? $rname : $tech->getName());
                    }
                    if (!empty($tech->fields['usertitles_id'])) {
                        $ut = new UserTitle();
                        if ($ut->getFromDB((int)$tech->fields['usertitles_id'])) {
                            $tech_title = $ut->getName();
                        }
                    }
                }
            }
            $ticket['technician'] = $tech_name;
            $ticket['technician_id'] = $tech_user_id;
            $ticket['technician_title'] = $tech_title;
            $is_my = ($myUserId > 0 && ($tech_user_id === $myUserId || (int)$ticket['users_id_recipient'] === $myUserId));
            if (!$is_my && $myUserId > 0) {
                $req_count = $DB->request([
                    'COUNT' => 'c',
                    'FROM'  => 'glpi_tickets_users',
                    'WHERE' => [
                        'tickets_id' => $ticket['id'],
                        'users_id'   => $myUserId
                    ]
                ])->current();
                $is_my = ($req_count && (int)$req_count['c'] > 0);
            }
            $ticket['is_my_ticket'] = $is_my;

            // Group (Departamento)
            $group_name = '';
            $group_iterator = $DB->request([
                'SELECT' => ['groups_id'],
                'FROM' => 'glpi_groups_tickets',
                'WHERE' => [
                    'tickets_id' => $ticket['id'],
                    'type' => CommonITILActor::ASSIGN
                ],
                'LIMIT' => 1
            ]);
            foreach ($group_iterator as $gu) {
                $gid = (int)$gu['groups_id'];
                if (empty($tech_name)) {
                    $gu_iter = $DB->request([
                        'SELECT' => ['glpi_users.id', 'glpi_users.name', 'glpi_users.firstname', 'glpi_users.realname'],
                        'FROM'   => 'glpi_groups_users',
                        'INNER JOIN' => [
                            'glpi_users' => [
                                'FKEY' => [
                                    'glpi_groups_users' => 'users_id',
                                    'glpi_users' => 'id'
                                ]
                            ]
                        ],
                        'WHERE'  => [
                            'glpi_groups_users.groups_id' => $gid
                        ],
                        'ORDER'  => 'glpi_groups_users.id DESC',
                        'LIMIT'  => 1
                    ]);
                    foreach ($gu_iter as $g_user) {
                        $gfname = trim($g_user['firstname'] ?? '');
                        $grname = trim($g_user['realname'] ?? '');
                        if (!empty($gfname) && !empty($grname)) {
                            $tech_name = (stripos($gfname, $grname) !== false) ? $gfname : "$gfname $grname";
                        } else {
                            $tech_name = !empty($gfname) ? $gfname : (!empty($grname) ? $grname : $g_user['name']);
                        }
                    }
                }
                $grp = new Group();
                if ($grp->getFromDB($gid)) {
                    $group_name = $grp->getName();
                }
            }
            $ticket['assigned_group'] = $group_name;
            $ticket['assignee'] = $tech_name ?: $group_name ?: '';

            // Elapsed time
            $time_diff = time() - strtotime($ticket['date_mod']);
            if ($time_diff < 3600) {
                $ticket['time_ago'] = max(1, round($time_diff / 60)) . 'm';
            } elseif ($time_diff < 86400) {
                $ticket['time_ago'] = round($time_diff / 3600) . 'h';
            } else {
                $ticket['time_ago'] = round($time_diff / 86400) . 'd';
            }

            // High urgency/priority flag for amber card style
            $ticket['is_urgent'] = (int)$ticket['priority'] >= 4 || (int)$ticket['urgency'] >= 4;

            $columns[$status]['tickets'][] = $ticket;
        }

        return $columns;
    }
}
