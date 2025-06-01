import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import path from 'path';
import { errorHandler } from './middleware/error.middleware';
import { chatRoutes } from './routes/chat.routes';
import { modelsRoutes } from './routes/models.routes';
import { agentRoutes } from './routes/agent.route';
import { gdriveRoutes } from './routes/gdrive.route';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;
const API_KEY = process.env.API_KEY;
const JWT_SECRET = process.env.JWT_SECRET;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

app.use(express.json({
  limit: '50mb'
}));

app.use(express.urlencoded({ extended: true }));

app.use('/data', express.static(path.join(__dirname, '../data')));

app.use('/api/chat', chatRoutes);
app.use('/api/models', modelsRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/gdrive', gdriveRoutes);

app.get('/', (req, res) => {
  res.json({
    message: 'OnAra AI API is running',
    endpoints: {
      chat: '/api/chat',
      models: '/api/models',
      agents: '/api/agents',
      files: '/api/files',
      auth: JWT_SECRET ? 'Required (Bearer token)' : 'Not configured',
      docs: 'See available routes in the documentation'
    }
  });
});

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

export default app;