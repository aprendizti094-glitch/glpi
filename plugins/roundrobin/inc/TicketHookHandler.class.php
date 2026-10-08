<?php

/**
 * -------------------------------------------------------------------------
 * RoundRobin plugin for GLPI
 * -------------------------------------------------------------------------
 *
 * LICENSE
 *
 * This file is part of RoundRobin GLPI Plugin.
 *
 * RoundRobin is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 3 of the License, or
 * (at your option) any later version.
 *
 * RoundRobin is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with RoundRobin. If not, see <http://www.gnu.org/licenses/>.
 * -------------------------------------------------------------------------
 * @copyright Copyright (C) 2022 by initiativa s.r.l. - http://www.initiativa.it
 * @license   GPLv3 https://www.gnu.org/licenses/gpl-3.0.html
 * @link      https://github.com/initiativa/roundrobin
 * -------------------------------------------------------------------------
 */
require_once 'IHookItemHandler.php';

class PluginRoundRobinTicketHookHandler extends CommonDBTM implements IPluginRoundRobinHookItemHandler {

    protected $DB;
    protected $rrAssignmentsEntity;

    public function __construct() {
        global $DB;

        $this->DB = $DB;
        $this->rrAssignmentsEntity = new PluginRoundRobinRRAssignmentsEntity();
    }

    public function itemAdded(CommonDBTM $item) {
        PluginRoundRobinLogger::addDebug(__METHOD__ . " - Item Type: " . $item->getType());
        if ($item->getType() !== 'Ticket') {
            return;
        }
        PluginRoundRobinLogger::addDebug(__METHOD__ . " - TicketId: " . $this->getTicketId($item));
        PluginRoundRobinLogger::addDebug(__METHOD__ . " - CategoryId: " . $this->getTicketCategory($item));
        $this->assignTicket($item);
    }

    protected function getTicketId(CommonDBTM $item) {
        return $item->fields['id'];
    }

    protected function getTicketCategory(CommonDBTM $item) {
        return $item->fields['itilcategories_id'];
    }

    public function getGroupsUsersByCategory($categoryId) {
        $categoryId = (int)$categoryId;
        if ($categoryId > 0) {
            $sql = <<< EOT
                SELECT 
                    c.name AS Category,
                    c.completename AS CategoryCompleteName,
                    g.name AS 'Group',
                    gu.id AS UserGroupId,
                    gu.users_id AS UserId,
                    u.name AS Username,
                    u.firstname AS UserFirstname,
                    u.realname AS UserRealname,
                    u.usertitles_id AS UserTitleId,
                    ut.name AS UserTitleName
                FROM
                    glpi_itilcategories c
                JOIN
                    glpi_groups g ON c.groups_id = g.id
                JOIN
                    glpi_groups_users gu ON gu.groups_id = g.id
                JOIN
                    glpi_users u ON gu.users_id = u.id
                LEFT JOIN
                    glpi_usertitles ut ON u.usertitles_id = ut.id
                WHERE
                    c.id = {$categoryId}
                    AND u.is_deleted = 0
                    AND u.is_active = 1
                ORDER BY gu.id ASC
EOT;
            $resultCollection = $this->DB->query($sql);
            if ($resultCollection && $this->DB->numrows($resultCollection) > 0) {
                return iterator_to_array($resultCollection);
            }
        }

        // Fallback to Group 1 (Departamento- TI)
        $sqlFallback = <<< EOT
            SELECT 
                'Geral' AS Category,
                'Geral' AS CategoryCompleteName,
                g.name AS 'Group',
                gu.id AS UserGroupId,
                gu.users_id AS UserId,
                u.name AS Username,
                u.firstname AS UserFirstname,
                u.realname AS UserRealname,
                u.usertitles_id AS UserTitleId,
                ut.name AS UserTitleName
            FROM
                glpi_groups g
            JOIN
                glpi_groups_users gu ON gu.groups_id = g.id
            JOIN
                glpi_users u ON gu.users_id = u.id
            LEFT JOIN
                glpi_usertitles ut ON u.usertitles_id = ut.id
            WHERE
                g.id = 1
                AND u.is_deleted = 0
                AND u.is_active = 1
            ORDER BY gu.id ASC
EOT;
        $resultCollection = $this->DB->query($sqlFallback);
        return ($resultCollection && $this->DB->numrows($resultCollection) > 0) ? iterator_to_array($resultCollection) : [];
    }

    /**
     * Filter technicians based on ticket urgency and technician level/title.
     *
     * Urgencies in GLPI:
     * 1 = Muito baixa
     * 2 = Baixa
     * 3 = Média
     * 4 = Alta
     * 5 = Muito alta
     *
     * Rules:
     * - Urgency 1 & 2: Aprendiz (fallback to all if no Aprendiz available)
     * - Urgency 3: Both Aprendiz and Pleno (load balancing across all)
     * - Urgency 4 & 5: Pleno & Sênior ONLY (strictly excludes Aprendiz; emergency fallback only if no Pleno/Senior exists)
     */
    public function filterTechniciansByUrgency(array $members, int $urgency): array {
        if (empty($members)) {
            return [];
        }

        $aprendizes = [];
        $plenos = [];
        $indefinidos = [];

        foreach ($members as $m) {
            $title = mb_strtolower(trim($m['UserTitleName'] ?? ''), 'UTF-8');
            if (strpos($title, 'aprendiz') !== false || strpos($title, 'junior') !== false || strpos($title, 'júnior') !== false) {
                $aprendizes[] = $m;
            } elseif (strpos($title, 'pleno') !== false || strpos($title, 'senior') !== false || strpos($title, 'sênior') !== false) {
                $plenos[] = $m;
            } else {
                $indefinidos[] = $m;
            }
        }

        PluginRoundRobinLogger::addDebug(__METHOD__ . " - Urgency: {$urgency}, Aprendizes: " . count($aprendizes) . ", Plenos: " . count($plenos) . ", Indefinidos: " . count($indefinidos));

        // 1. Urgência Baixa ou Muito Baixa (1 e 2): Prioriza Aprendiz
        if ($urgency <= 2) {
            if (!empty($aprendizes)) {
                return $aprendizes;
            }
            // Fallback se não houver aprendiz no grupo
            return !empty($indefinidos) ? array_merge($indefinidos, $plenos) : $members;
        }

        // 2. Urgência Média (3): Aprendiz e Pleno podem atender (distribui por menor carga)
        if ($urgency === 3) {
            return $members;
        }

        // 3. Urgência Alta ou Muito Alta (4 e 5): Exclusivo para Pleno / Sênior (bloqueia Aprendiz)
        if ($urgency >= 4) {
            $qualificados = array_merge($plenos, $indefinidos);
            if (!empty($qualificados)) {
                return $qualificados;
            }
            // Fallback de emergência (se só existir aprendiz no grupo para não travar o chamado)
            return $members;
        }

        return $members;
    }

    /**
     * Pick the technician with the fewest active tickets (Load Balancing / Menos atolado)
     */
    protected function pickLeastBusyTechnicianIndex(array $categoryGroupMembers, $lastAssignmentIndex) {
        if (empty($categoryGroupMembers)) {
            return 0;
        }

        // Reindex array to guarantee consecutive integer keys
        $categoryGroupMembers = array_values($categoryGroupMembers);

        $userCounts = [];
        foreach ($categoryGroupMembers as $member) {
            $userCounts[(int)$member['UserId']] = 0;
        }

        $uidsList = implode(',', array_keys($userCounts));
        $sqlCounts = "SELECT tu.users_id, COUNT(t.id) as open_tickets
                      FROM glpi_tickets_users tu
                      JOIN glpi_tickets t ON tu.tickets_id = t.id
                      WHERE tu.type = 2
                        AND t.status NOT IN (5, 6)
                        AND t.is_deleted = 0
                        AND tu.users_id IN ({$uidsList})
                      GROUP BY tu.users_id";
        $resCounts = $this->DB->query($sqlCounts);
        if ($resCounts) {
            while ($row = $this->DB->fetchAssoc($resCounts)) {
                $userCounts[(int)$row['users_id']] = (int)$row['open_tickets'];
            }
        }

        // Minimum ticket load among technicians in the group
        $minTickets = min($userCounts);
        $tiedIndices = [];
        foreach ($categoryGroupMembers as $idx => $m) {
            if ($userCounts[(int)$m['UserId']] === $minTickets) {
                $tiedIndices[] = $idx;
            }
        }

        // If only one technician has the minimum load, assign to them immediately
        $chosenIndex = $tiedIndices[0];

        // If multiple technicians tie for least busy, use round-robin rotation
        if ($lastAssignmentIndex !== null && count($tiedIndices) > 1) {
            $foundNext = false;
            foreach ($tiedIndices as $tIdx) {
                if ($tIdx > $lastAssignmentIndex) {
                    $chosenIndex = $tIdx;
                    $foundNext = true;
                    break;
                }
            }
            if (!$foundNext) {
                $chosenIndex = $tiedIndices[0];
            }
        }

        return $chosenIndex;
    }

    protected function assignTicket(CommonDBTM $item) {
        $ticketId = (int)$this->getTicketId($item);
        if ($ticketId <= 0) {
            return null;
        }

        $itilcategoriesId = (int)$this->getTicketCategory($item);
        $urgency = isset($item->fields['urgency']) ? (int)$item->fields['urgency'] : 3;
        if ($urgency <= 0) {
            $ticket = new Ticket();
            if ($ticket->getFromDB($ticketId)) {
                $urgency = (int)($ticket->fields['urgency'] ?? 3);
            }
        }

        $lastAssignmentIndex = $this->getLastAssignmentIndex($item);
        if ($lastAssignmentIndex === false) {
            $lastAssignmentIndex = null;
        }

        $categoryGroupMembers = $this->getGroupsUsersByCategory($itilcategoriesId);
        if (count($categoryGroupMembers) === 0) {
            PluginRoundRobinLogger::addDebug(__FUNCTION__ . ' - No members found for ticket ' . $ticketId);
            return null;
        }

        // Filter eligible technicians based on urgency and seniority level
        $eligibleMembers = $this->filterTechniciansByUrgency($categoryGroupMembers, $urgency);
        if (empty($eligibleMembers)) {
            $eligibleMembers = $categoryGroupMembers;
        }

        // Select the least busy technician among eligible
        $newAssignmentIndex = $this->pickLeastBusyTechnicianIndex($eligibleMembers, $lastAssignmentIndex);
        $this->rrAssignmentsEntity->updateLastAssignmentIndex($itilcategoriesId, $newAssignmentIndex);

        /**
         * set the assignment
         */
        $userId = (int)$eligibleMembers[$newAssignmentIndex]['UserId'];
        $this->setAssignment($ticketId, $userId, $itilcategoriesId);
        return $userId;
    }

    public function findUserIdToAssign(int $itilcategoriesId, bool $storeChoice = true, int $urgency = 3) {
        $lastAssignmentIndex = $this->getLastAssignmentIndexId($itilcategoriesId);
        if ($lastAssignmentIndex === false) {
            $lastAssignmentIndex = null;
        }
        $categoryGroupMembers = $this->getGroupsUsersByCategory($itilcategoriesId);
        if (count($categoryGroupMembers) === 0) {
            return null;
        }

        $eligibleMembers = $this->filterTechniciansByUrgency($categoryGroupMembers, $urgency);
        if (empty($eligibleMembers)) {
            $eligibleMembers = $categoryGroupMembers;
        }

        $newAssignmentIndex = $this->pickLeastBusyTechnicianIndex($eligibleMembers, $lastAssignmentIndex);

        if ($storeChoice) {
            $this->rrAssignmentsEntity->updateLastAssignmentIndex($itilcategoriesId, $newAssignmentIndex);
        }

        $userId = (int)$eligibleMembers[$newAssignmentIndex]['UserId'];
        return $userId;
    }

    protected function getLastAssignmentIndexId(int $categoryId) {
        return $this->rrAssignmentsEntity->getLastAssignmentIndex($categoryId);
    }

    protected function getLastAssignmentIndex(CommonDBTM $item) {
        $itilcategoriesId = (int)$this->getTicketCategory($item);
        return $this->rrAssignmentsEntity->getLastAssignmentIndex($itilcategoriesId);
    }

    protected function setAssignment($ticketId, $userId, $itilcategoriesId) {
        $ticketId = (int)$ticketId;
        $userId = (int)$userId;
        if ($ticketId <= 0 || $userId <= 0) {
            return;
        }

        // 1. Remove previous assigned technician
        $this->DB->delete('glpi_tickets_users', [
            'tickets_id' => $ticketId,
            'type' => 2 // CommonITILActor::ASSIGN
        ]);

        // 2. Insert new technician assignment
        $tu = new Ticket_User();
        $tu->add([
            'tickets_id' => $ticketId,
            'users_id' => $userId,
            'type' => 2,
            'use_notification' => 0
        ]);

        // 3. Assign Group if enabled
        if ($this->rrAssignmentsEntity->getOptionAutoAssignGroup() === 1) {
            $groups_id = 1;
            if ($itilcategoriesId > 0) {
                $catGroup = $this->rrAssignmentsEntity->getGroupByItilCategory($itilcategoriesId);
                if ($catGroup) {
                    $groups_id = (int)$catGroup;
                }
            }

            $existingGroup = $this->DB->request([
                'FROM' => 'glpi_groups_tickets',
                'WHERE' => [
                    'tickets_id' => $ticketId,
                    'type' => 2
                ]
            ]);
            if (count($existingGroup) === 0) {
                $gt = new Group_Ticket();
                $gt->add([
                    'tickets_id' => $ticketId,
                    'groups_id' => $groups_id,
                    'type' => 2
                ]);
            }
        }

        // 4. Update ticket status to ASSIGNED (2) if it was INCOMING (1)
        $ticket = new Ticket();
        if ($ticket->getFromDB($ticketId)) {
            if ((int)$ticket->fields['status'] === 1) {
                $ticket->update([
                    'id' => $ticketId,
                    'status' => 2
                ]);
            }
        }
    }

    public function itemPurged(CommonDBTM $item) {
        PluginRoundRobinLogger::addDebug(__FUNCTION__ . ' - nothing to do');
    }

    public function itemDeleted(CommonDBTM $item) {
        PluginRoundRobinLogger::addDebug(__FUNCTION__ . ' - nothing to do');
    }

}
