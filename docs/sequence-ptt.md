# PTT Sequence Diagram
1. User holds PTT button
2. App calls startPTT(talkgroupId)
3. SkyTalkComms sends PTT_START with GPS timestamp
4. AudioPipeline starts recording 60ms Opus frames
5. Each frame sent as PTT_AUDIO chunk to relay
6. Relay fans out to all talkgroup members
7. Receivers decode and play audio
8. User releases PTT → PTT_END sent → floor released
