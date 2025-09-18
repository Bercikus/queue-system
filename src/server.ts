import express, {Request, Response} from 'express';
import { EventEmitter } from 'events';
import fs from 'fs';

 
interface Task {
  taskId: string;
  payload: object;
}

const app = express();
const PORT: number = 3000;
const tasksQueue: Task[] = [];
const DLQ: Task[] = [];
const taskEvents = new EventEmitter();
const retries = new Map<string, number>();
const max_retries: number = 2;

taskEvents.on('taskAdded', () => {
  console.log('New task was added to queue');
});

taskEvents.on('taskProcessing', () => {
  if (!tasksQueue.length) {
    console.log('No tasks in queue');
    return;
  }

  const task = tasksQueue.shift();
  if (!task) return;

  processTask(task);
});

taskEvents.on('taskCompleted', (task) => {
  console.log(`Task ${task.taskId} was completed`);
});

taskEvents.on('taskFailed', (task) => {
  console.warn(`Task ${task.taskId} failed and was redirected to DLQ`);
});

taskEvents.on('taskRetried', ({ task, tries }) => {
  console.log(`Task ${task.taskId} failed retry number ${tries+1}`);
});

const logDLQTask = (task: Task) => {  
  const logEntry = {
    ...task,
    createdAt: new Date().toISOString()
  };

  fs.appendFile(
    'dlq.log',
    JSON.stringify(logEntry) + '\n',
    (err) => {
      if (err) console.error('Logging DLQ task failed:', err);
    }
  );

};

const addTask = (task: Task) => {
  tasksQueue.push(task);
  retries.set(task.taskId, 0);
  taskEvents.emit('taskAdded');
} 
 
const processTask = async (task: Task)  => {
  //process 
  const isComplete = Math.random() >= 0.3;
  if(isComplete){
    retries.delete(task.taskId);
    taskEvents.emit('taskCompleted', task);
    //here can be used await for async operations like save to DB
    return;
  }

  //retry
  const tries: number=retries.get(task.taskId) ?? 0;
  const delay = Math.pow(3, tries) * 1000;
  if(tries < max_retries)
  {
    retries.set(task.taskId, tries + 1);
    taskEvents.emit('taskRetried', { task, tries });
    setTimeout(() => { 
      processTask(task);
      //taskEvents.emit('taskProcessing', task);
    }, delay);
  }else{
    DLQ.push(task);
    retries.delete(task.taskId); 
    logDLQTask(task);
    taskEvents.emit('taskFailed', task);
  }
 
}


const monitorDLQ = () => {
  console.log('***');
  try { 
    fs.readFile('dlq.log', 'utf8', (err, data) => {
      
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

      console.log(
        `Last failed task \n TaskID: ${lastTask.taskId} 
        Payload: ${JSON.stringify(lastTask.payload)} 
        Date: ${lastTask.createdAt}`
      );
    });
 
  } catch (err) {
    console.error('Monitoring DLQ failed:', err);
  } 
};
 
setInterval(() => { 
  //processTask(task);
  taskEvents.emit('taskProcessing');
}, 5000);

setInterval(monitorDLQ, 10000);


app.use(express.json());  

app.get('/', (req: Request, res: Response) => {
  res.send('Server on!');
});

app.get('/queues', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify({ tasksQueue, DLQ }, null, 2));
});

 app.post('/tasks', (req: Request, res: Response) => { 
  const { taskId, payload } = req.body;

  if (!taskId || !payload) {
    res.status(400).json({ error: 'incomplete task' });
    return;
  }

  if(tasksQueue.some(t => t.taskId === taskId))
  {
    res.status(400).json({error: `Task with ID:${taskId} is already waiting for process in queue`})
    return;
  }

  const task = { taskId, payload };
  addTask(task);  
   
  res.status(201).json({ message: 'Task added', task });
});

 



app.listen(PORT, () => {
  console.log(`Server is running on localhost:${PORT}`);
});
