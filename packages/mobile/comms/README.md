# @forbiddenlan/comms

Owned by Saim. The communication layer between the mobile app and everything else.

## Test against real DLS-140 hardware
npx tsx src/test-dls140.ts

## Test floor control logic
npx tsx src/test-floor.ts

## Test full ForbiddenLANComms (needs mock WS server running on :9999)
npx tsx src/test-comms.ts

## Base URL
http://192.168.111.1:3000

## Default credentials
username: skytrac
password: skytrac
