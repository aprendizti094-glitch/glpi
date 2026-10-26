<?php

/**
 * ---------------------------------------------------------------------
 * GLPI - Gestionnaire Libre de Parc Informatique
 * Copyright (C) 2015-2026 Teclib' and contributors.
 * ---------------------------------------------------------------------
 * LICENSE: GPL-3.0-or-later
 * ---------------------------------------------------------------------
 */

use Glpi\Application\View\TemplateRenderer;

class Team extends CommonGLPI
{
    public static function getTypeName($nb = 0)
    {
        return __('Equipe', 'glpi');
    }

    public static function getMenuName()
    {
        return __('Equipe', 'glpi');
    }

    public static function getIcon()
    {
        return 'ti ti-users-group';
    }

    public static function getSearchURL($full = true)
    {
        return '/front/team.php';
    }

    public static function canView()
    {
        // Visible for Central interface users who have access to tickets or management
        return Session::getCurrentInterface() == 'central'
            && (Session::haveRight('ticket', READ) || Session::haveRight('user', READ));
    }

    public static function getMenuContent()
    {
        if (!static::canView()) {
            return false;
        }

        return [
            'title'    => __('Equipe', 'glpi'),
            'shortcut' => '',
            'page'     => '/front/team.php',
            'icon'     => 'ti ti-users-group',
            'links'    => [
                'search' => '/front/team.php',
            ],
        ];
    }

    /**
     * Retrieve all technicians with their SLA and performance metrics
     *
     * @param string $period 'all', 'month', '30days', '7days', 'today'
     * @return array
     */
    public static function getTechniciansStats(string $period = 'all'): array
    {
        /** @var \DBmysql $DB */
        global $DB;

        // Date filter condition
        $dateCondition = '';
        if ($period === 'today') {
            $dateCondition = " AND t.date >= '" . date('Y-m-d 00:00:00') . "'";
        } elseif ($period === '7days') {
            $dateCondition = " AND t.date >= '" . date('Y-m-d 00:00:00', strtotime('-7 days')) . "'";
        } elseif ($period === '30days') {
            $dateCondition = " AND t.date >= '" . date('Y-m-d 00:00:00', strtotime('-30 days')) . "'";
        } elseif ($period === 'month') {
            $dateCondition = " AND t.date >= '" . date('Y-m-01 00:00:00') . "'";
        }

        // Query all technicians: users with profile Technician (ID 6 or name 'Technician'/'Técnico')
        $techQuery = "SELECT u.id, u.name, u.realname, u.firstname, u.picture, u.phone, u.mobile,
                             ue.email, u.locations_id, l.completename AS location_name
                      FROM glpi_users u
                      JOIN glpi_profiles_users pu ON pu.users_id = u.id
                      JOIN glpi_profiles p ON p.id = pu.profiles_id
                      LEFT JOIN glpi_locations l ON l.id = u.locations_id
                      LEFT JOIN glpi_useremails ue ON (ue.users_id = u.id AND ue.is_default = 1)
                      WHERE (p.id = 6 OR LOWER(p.name) LIKE '%technician%' OR LOWER(p.name) LIKE '%t%cnico%')
                        AND u.is_deleted = 0
                      GROUP BY u.id
                      ORDER BY u.firstname ASC, u.realname ASC, u.name ASC";

        $techs = [];
        $iterator = $DB->request($techQuery);

        foreach ($iterator as $u) {
            $uid = (int)$u['id'];

            // Query tickets assigned to this technician
            $ticketQuery = "SELECT t.id, t.name, t.status, t.date, t.solvedate, t.closedate,
                                   t.solve_delay_stat, t.time_to_resolve, t.priority, t.urgency
                            FROM glpi_tickets_users tu
                            JOIN glpi_tickets t ON t.id = tu.tickets_id
                            WHERE tu.users_id = $uid
                              AND tu.type = " . CommonITILActor::ASSIGN . "
                              AND t.is_deleted = 0
                              $dateCondition
                            ORDER BY t.id DESC";

            $tickets = [];
            $totalAssigned = 0;
            $completedCount = 0;
            $inProgressCount = 0;
            $totalMinutes = 0;
            $withinSlaCount = 0;
            $slaEvaluatedCount = 0;

            foreach ($DB->request($ticketQuery) as $ticket) {
                $totalAssigned++;
                $statusId = (int)$ticket['status'];
                $isSolved = in_array($statusId, [CommonITILObject::SOLVED, CommonITILObject::CLOSED]);

                $durationMin = 0;
                $isWithinSla = true;

                if ($isSolved) {
                    $completedCount++;

                    // Calculate resolution duration in minutes
                    $durationSec = (int)$ticket['solve_delay_stat'];
                    if ($durationSec <= 0 && !empty($ticket['solvedate']) && !empty($ticket['date'])) {
                        $durationSec = max(60, strtotime($ticket['solvedate']) - strtotime($ticket['date']));
                    }
                    $durationMin = round($durationSec / 60, 1);
                    $totalMinutes += $durationMin;

                    // Evaluate SLA compliance
                    $slaEvaluatedCount++;
                    if (!empty($ticket['time_to_resolve'])) {
                        $isWithinSla = (strtotime($ticket['solvedate']) <= strtotime($ticket['time_to_resolve']));
                    } else {
                        // Standard target resolution time (based on priority)
                        $targetMin = 240; // Default 4 hours
                        if ($ticket['priority'] >= 5) {
                            $targetMin = 120; // 2h for Very High
                        } elseif ($ticket['priority'] == 4) {
                            $targetMin = 240; // 4h for High
                        } elseif ($ticket['priority'] <= 2) {
                            $targetMin = 1440; // 24h for Low
                        } else {
                            $targetMin = 480; // 8h for Medium
                        }
                        $isWithinSla = ($durationMin <= $targetMin);
                    }

                    if ($isWithinSla) {
                        $withinSlaCount++;
                    }
                } else {
                    $inProgressCount++;
                }

                $tickets[] = [
                    'id'               => $ticket['id'],
                    'name'             => $ticket['name'],
                    'status'           => $statusId,
                    'status_label'     => Ticket::getStatus($statusId),
                    'date'             => $ticket['date'],
                    'solvedate'        => $ticket['solvedate'],
                    'duration_minutes' => $durationMin,
                    'duration_formatted' => self::formatMinutes($durationMin),
                    'is_solved'        => $isSolved,
                    'is_within_sla'    => $isWithinSla,
                    'time_to_resolve'  => $ticket['time_to_resolve'],
                ];
            }

            $avgMinutes = $completedCount > 0 ? round($totalMinutes / $completedCount, 1) : 0;
            $slaRate = $slaEvaluatedCount > 0 ? round(($withinSlaCount / $slaEvaluatedCount) * 100) : 100;

            // Formatted name
            $fullName = trim($u['firstname'] . ' ' . $u['realname']);
            if (empty($fullName)) {
                $fullName = $u['name'];
            }

            // Initials for Apple avatar
            $initials = '';
            $parts = preg_split('/\s+/', $fullName);
            if (!empty($parts[0])) {
                $initials .= mb_substr($parts[0], 0, 1);
            }
            if (count($parts) > 1 && !empty($parts[count($parts) - 1])) {
                $initials .= mb_substr($parts[count($parts) - 1], 0, 1);
            }
            $initials = strtoupper($initials ?: 'TI');

            // Location tag badge color (Apple capsule)
            $loc = strtoupper($u['location_name'] ?? '');
            $locClass = 'loc-custom';
            if (strpos($loc, 'DF') !== false) {
                $locClass = 'loc-df';
            } elseif (strpos($loc, 'TO') !== false) {
                $locClass = 'loc-to';
            } elseif (strpos($loc, 'GO') !== false) {
                $locClass = 'loc-go';
            } elseif (strpos($loc, 'MS') !== false) {
                $locClass = 'loc-ms';
            }

            $techs[] = [
                'id'                 => $uid,
                'name'               => $u['name'],
                'full_name'          => $fullName,
                'initials'           => $initials,
                'email'              => $u['email'] ?? '',
                'location_name'      => $u['location_name'] ?: 'Geral',
                'location_class'     => $locClass,
                'total_assigned'     => $totalAssigned,
                'completed_count'    => $completedCount,
                'in_progress_count'  => $inProgressCount,
                'avg_minutes'        => $avgMinutes,
                'avg_minutes_formatted' => self::formatMinutes($avgMinutes),
                'sla_rate'           => $slaRate,
                'sla_status_badge'   => self::getSlaBadge($slaRate),
                'tickets'            => $tickets,
            ];
        }

        return $techs;
    }

    /**
     * Compute aggregated global stats for all technicians
     *
     * @param array $techs
     * @return array
     */
    public static function getGlobalStats(array $techs): array
    {
        $totalTechs = count($techs);
        $totalCompleted = 0;
        $totalInProgress = 0;
        $totalAssigned = 0;
        $allMinutesSum = 0;
        $allCompletedSum = 0;
        $slaRatesSum = 0;

        foreach ($techs as $t) {
            $totalCompleted += $t['completed_count'];
            $totalInProgress += $t['in_progress_count'];
            $totalAssigned += $t['total_assigned'];
            $allMinutesSum += ($t['avg_minutes'] * $t['completed_count']);
            $allCompletedSum += $t['completed_count'];
            $slaRatesSum += $t['sla_rate'];
        }

        $globalAvgMinutes = $allCompletedSum > 0 ? round($allMinutesSum / $allCompletedSum, 1) : 0;
        $globalSlaRate = $totalTechs > 0 ? round($slaRatesSum / $totalTechs) : 100;

        return [
            'total_techs'            => $totalTechs,
            'total_completed'        => $totalCompleted,
            'total_in_progress'      => $totalInProgress,
            'total_assigned'         => $totalAssigned,
            'global_avg_minutes'     => $globalAvgMinutes,
            'global_avg_formatted'   => self::formatMinutes($globalAvgMinutes),
            'global_sla_rate'        => $globalSlaRate,
        ];
    }

    /**
     * Helper to format minutes into human readable duration
     *
     * @param float $minutes
     * @return string
     */
    public static function formatMinutes(float $minutes): string
    {
        if ($minutes <= 0) {
            return '0 min';
        }

        if ($minutes < 60) {
            return number_format($minutes, ($minutes == floor($minutes) ? 0 : 1), ',', '.') . ' min';
        }

        $hours = floor($minutes / 60);
        $remainingMin = round($minutes - ($hours * 60));

        if ($hours < 24) {
            return "{$hours}h {$remainingMin}m";
        }

        $days = floor($hours / 24);
        $remainingHours = $hours % 24;
        return "{$days}d {$remainingHours}h";
    }

    /**
     * Helper to get SLA badge color and label
     *
     * @param int $rate
     * @return array
     */
    public static function getSlaBadge(int $rate): array
    {
        if ($rate >= 90) {
            return [
                'class' => 'badge-apple-green',
                'label' => 'Excelente',
                'color' => '#34C759',
                'bg'    => 'rgba(52, 199, 89, 0.12)'
            ];
        }
        if ($rate >= 75) {
            return [
                'class' => 'badge-apple-blue',
                'label' => 'Bom',
                'color' => '#007AFF',
                'bg'    => 'rgba(0, 122, 255, 0.12)'
            ];
        }
        if ($rate >= 50) {
            return [
                'class' => 'badge-apple-amber',
                'label' => 'Atenção',
                'color' => '#FF9500',
                'bg'    => 'rgba(255, 149, 0, 0.12)'
            ];
        }
        return [
            'class' => 'badge-apple-red',
            'label' => 'Crítico',
            'color' => '#FF3B30',
            'bg'    => 'rgba(255, 59, 48, 0.12)'
        ];
    }
}
