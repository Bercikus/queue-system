# Queue System
Fault-tolerant backend queue simulation built with Node.js and TypeScript.

## Features
- Local task processing with retry logic
- Simulated dead-letter queue logged to `dlq.log`
- Scalable event-driven architecture
- Error handling included

## Installation
Node.js installed.
```bash
npm install
npx tsc
node dist/server.js
```

## Notes
- The system works locally on Node.js server
- Tasks sent to the `/tasks` API are placed in queue simulated as an array
- Tasks are processed locally with a retry mechanism (2 tries)
- 30% of tasks are randomly failed during processing
- Failed tasks after max retries are written to a local dead-letter queue (array), and logged to `dlq.log`
- Monitoring runs every 10 seconds, checking number of tasks in DLQ and displays the latest failed task

## Author
Robert Szafarski (Bercikus)