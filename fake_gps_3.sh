#!/bin/bash

systemctl stop healthcheck
systemctl stop gps_daemon
mosquitto_pub -t 'gps' -m '{"timestamp": "2025-05-27T15:56:40Z","mode": 3,"latitude": 45.344087,"longitude": -75.710067,"altitude": 79.4,"speed": 1.466,"track": 329.09}' -r
