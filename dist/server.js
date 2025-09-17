"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const events_1 = require("events");
const fs_1 = __importDefault(require("fs"));
const app = (0, express_1.default)();
const PORT = 3000;
const tasksQueue = [];
const DLQ = [];
const taskEvents = new events_1.EventEmitter();
const retries = new Map();
const max_retries = 2;
taskEvents.on('taskAdded', () => {
    console.log('New task was added to queue');
});
taskEvents.on('taskProcessing', () => {
    if (!tasksQueue.length) {
        console.log('No tasks in queue');
        return;
    }
    const task = tasksQueue.shift();
    if (!task)
        return;
    processTask(task);
});
taskEvents.on('taskCompleted', (task) => {
    console.log(`Task ${task.taskId} was completed`);
});
taskEvents.on('taskFailed', (task) => {
    console.warn(`Task ${task.taskId} failed and was redirected to DLQ`);
});
taskEvents.on('taskRetried', ({ task, tries }) => {
    console.log(`Task ${task.taskId} failed retry number ${tries + 1}`);
});
try {
    const raw = fs_1.default.readFileSync('dlq.json', 'utf-8');
    const tasks = JSON.parse(raw);
    DLQ.push(...tasks);
}
catch (err) {
    console.warn('DLQ file is invalid or doesnt exist :', err);
}
const logDLQTask = (task) => {
    const logEntry = {
        ...task,
        createdAt: new Date().toISOString()
    };
    fs_1.default.appendFile('dlq.log', JSON.stringify(logEntry) + '\n', (err) => {
        if (err)
            console.error('Logging DLQ task failed:', err);
    });
};
const addTask = (task) => {
    tasksQueue.push(task);
    retries.set(task.taskId, 0);
    taskEvents.emit('taskAdded');
};
const processTask = async (task) => {
    //process 
    const isComplete = Math.random() >= 0.3;
    if (isComplete) {
        retries.delete(task.taskId);
        taskEvents.emit('taskCompleted', task);
        //here can be used await for async operations like save to DB
        return;
    }
    //retry
    const tries = retries.get(task.taskId) ?? 0;
    const delay = Math.pow(3, tries) * 1000;
    if (tries < max_retries) {
        retries.set(task.taskId, tries + 1);
        taskEvents.emit('taskRetried', { task, tries });
        setTimeout(() => {
            processTask(task);
            //taskEvents.emit('taskProcessing', task);
        }, delay);
    }
    else {
        DLQ.push(task);
        retries.delete(task.taskId);
        logDLQTask(task);
        taskEvents.emit('taskFailed', task);
    }
};
const monitorDLQ = () => {
    console.log('***');
    try {
        fs_1.default.readFile('dlq.log', 'utf8', (err, data) => {
            if (err) {
                console.error('Failed to read DLQ log:', err);
                return;
            }
            const lines = data.trim().split('\n');
            const lastLine = lines[lines.length - 1];
            const size = lines.length;
            console.log(`DLQ contains ${size} tasks`);
            if (!lastLine || !lines.length) {
                console.log('Dlq is empty!');
                return;
            }
            const lastTask = JSON.parse(lastLine);
            console.log(`Last failed task \n TaskID: ${lastTask.taskId} 
         Payload: ${JSON.stringify(lastTask.payload)} 
         Date: ${lastTask.createdAt}`);
        });
    }
    catch (err) {
        console.error('Monitoring DLQ failed:', err);
    }
    console.log("***");
};
setInterval(() => {
    //processTask(task);
    taskEvents.emit('taskProcessing');
}, 5000);
setInterval(monitorDLQ, 10000);
app.use(express_1.default.json());
app.get('/', (req, res) => {
    res.send('Server on!');
});
app.get('/queues', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify({ tasksQueue, DLQ }, null, 2));
});
app.post('/tasks', (req, res) => {
    const { taskId, payload } = req.body;
    if (!taskId || !payload) {
        res.status(400).json({ error: 'incomplete task' });
        return;
    }
    if (tasksQueue.some(t => t.taskId === taskId)) {
        res.status(400).json({ error: `Task with ID:${taskId} is already waiting for process in queue` });
        return;
    }
    const task = { taskId, payload };
    addTask(task);
    res.status(201).json({ message: 'Task added', task });
});
app.listen(PORT, () => {
    console.log(`Server is running on localhost:${PORT}`);
});
//# sourceMappingURL=server.js.map