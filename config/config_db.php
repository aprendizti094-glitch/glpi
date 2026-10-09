<?php
class DB extends DBmysql {
   public $dbhost = '127.0.0.1';
   public $dbuser = 'root';
   public $dbpassword = '';
   public $dbdefault = 'glpi';
   public $use_utf8mb4 = true;
   public $allow_myisam = false;
   public $allow_datetime = false;
   public $allow_signed_keys = false;

   public function __construct($choice = null) {
       $this->detectDatabase();
       parent::__construct($choice);
   }

   protected function detectDatabase() {
       $mysqli = @new mysqli($this->dbhost, $this->dbuser, rawurldecode($this->dbpassword));
       if ($mysqli && !$mysqli->connect_error) {
           $res = $mysqli->query("SHOW DATABASES");
           if ($res) {
               $dbs = [];
               while ($row = $res->fetch_array()) {
                   $dbs[] = $row[0];
               }
               foreach (['glpi', 'glpidb', 'glpi_db'] as $candidate) {
                   if (in_array($candidate, $dbs)) {
                       $this->dbdefault = $candidate;
                       break;
                   }
               }
           }
           $mysqli->close();
       }
   }
}
