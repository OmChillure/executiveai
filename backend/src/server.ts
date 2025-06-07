import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import path from 'path';
import { errorHandler } from './middleware/error.middleware';
import { chatRoutes } from './routes/chat.routes';
import { modelsRoutes } from './routes/models.routes';
import { agentRoutes } from './routes/agent.route';
import { gdriveRoutes } from './routes/gdrive.route';
import { fileRoutes } from './routes/file.routes';
import { githubRoutes } from './routes/github.route';
import { gdocsRoutes } from './routes/gdocs.route';
import { gsheetsRoutes } from './routes/gsheets.route';

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5001;

app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://onaraai.xyz/',
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'Cache-Control',
    'Accept',
    'Accept-Encoding',
    'Accept-Language',
    'Connection',
    'Host',
    'Origin',
    'Referer',
    'User-Agent',
    'X-Requested-With'
  ],
  exposedHeaders: [
    'Content-Type',
    'Cache-Control',
    'Connection'
  ],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204,
  maxAge: 86400
}));

app.options('/api/chat/:id/stream', (req, res) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cache-Control, Accept');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.status(204).send();
});

app.options('/api/chat/:id/tools', (req, res) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cache-Control, Accept');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.status(204).send();
});

app.use(express.json({
  limit: '50mb'
}));

app.use(express.urlencoded({ 
  extended: true,
  limit: '50mb'
}));

app.use('/data', express.static(path.join(__dirname, '../data')));

app.use('/api/chat', chatRoutes);
app.use('/api/models', modelsRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/gdrive', gdriveRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/github', githubRoutes);
app.use('/api/gdocs', gdocsRoutes);
app.use('/api/gsheets', gsheetsRoutes); 

app.use(errorHandler);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});
