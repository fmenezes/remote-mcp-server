#!/bin/bash

touch /tmp/kc.log
nohup /opt/keycloak/bin/kc.sh start-dev --import-realm > /tmp/kc.log 2>&1 &
tail -f /tmp/kc.log
