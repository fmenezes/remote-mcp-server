#!/bin/bash

kill 8
kc.sh export --dir /opt/keycloak/data/import --users realm_file
nohup /opt/keycloak/bin/kc.sh start-dev --import-realm > /tmp/kc.log 2>&1 &
