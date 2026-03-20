import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import cors from 'cors';
import dotenv from 'dotenv';
import { google } from 'googleapis';
import session from 'express-session';

dotenv.config();

const app = express();
const PORT = 3000;

console.log('APP_URL configured as:', process.env.APP_URL ? `${process.env.APP_URL.substring(0, 15)}...` : 'NOT SET');

// Trust the reverse proxy (nginx) for express-session
app.set('trust proxy', 1);

// Use express-session for storing OAuth tokens
app.use(session({
  name: 'pitch-perfect.sid',
  secret: process.env.SESSION_SECRET || 'pitch-perfect-secret',
  resave: false,
  saveUninitialized: true,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    secure: true,
    sameSite: 'none',
    httpOnly: true,
  },
}));

// Extend session type for TypeScript
declare module 'express-session' {
  interface SessionData {
    tokens: any;
  }
}

app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json());

const getOAuthClient = () => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;

  if (!clientId || !clientSecret) {
    console.warn('Google OAuth credentials missing. Integration will be disabled.');
    return null;
  }

  return new google.auth.OAuth2(
    clientId,
    clientSecret,
    `${appUrl}/api/auth/google/callback`
  );
};

const oauth2Client = getOAuthClient();

// Auth Routes
app.get('/api/auth/google/url', (req, res) => {
  if (!oauth2Client) return res.status(500).json({ error: 'OAuth not configured' });
  const scopes = [
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/documents.readonly',
    'https://www.googleapis.com/auth/presentations',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email',
  ];

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent',
  });

  res.json({ url });
});

app.get('/api/auth/google/callback', async (req, res) => {
  const { code } = req.query;
  if (!oauth2Client) return res.status(500).send('OAuth not configured');
  try {
    const { tokens } = await oauth2Client.getToken(code as string);
    req.session!.tokens = tokens;
    console.log('OAuth Success: Tokens saved to session:', req.sessionID);
    
    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Authentication successful. This window should close automatically.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('OAuth Callback Error:', error);
    res.status(500).send('Authentication failed');
  }
});

app.get('/api/auth/status', (req, res) => {
  res.json({ isAuthenticated: !!req.session?.tokens });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error('Logout error:', err);
    res.json({ success: true });
  });
});

// Google Drive/Docs Routes
app.get('/api/google/docs/list', async (req, res) => {
  console.log('Docs List Request - Session ID:', req.sessionID);
  if (!req.session?.tokens) {
    console.warn('Docs List: No tokens in session for session:', req.sessionID);
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  auth.setCredentials(req.session.tokens);
  const drive = google.drive({ version: 'v3', auth });

  try {
    const response = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.document' and trashed = false",
      fields: 'files(id, name, thumbnailLink, modifiedTime)',
      orderBy: 'modifiedTime desc',
    });
    res.json({ files: response.data.files });
  } catch (error: any) {
    console.error('Drive List Error:', error.message || error);
    res.status(500).json({ error: error.message || 'Failed to list docs' });
  }
});

app.get('/api/google/docs/content/:id', async (req, res) => {
  if (!req.session?.tokens) return res.status(401).json({ error: 'Unauthorized' });

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  auth.setCredentials(req.session.tokens);
  const docs = google.docs({ version: 'v1', auth });

  try {
    const doc = await docs.documents.get({ documentId: req.params.id });
    // Extract text from doc
    let text = '';
    doc.data.body?.content?.forEach(element => {
      if (element.paragraph) {
        element.paragraph.elements?.forEach(el => {
          if (el.textRun) text += el.textRun.content;
        });
      }
    });
    res.json({ text });
  } catch (error: any) {
    console.error('Docs Get Error:', error.message || error);
    res.status(500).json({ error: error.message || 'Failed to fetch doc content' });
  }
});

// Google Slides Route
app.post('/api/google/slides/create', async (req, res) => {
  if (!req.session?.tokens) return res.status(401).json({ error: 'Unauthorized' });
  const { slides, title } = req.body;

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  auth.setCredentials(req.session.tokens);
  const slidesApi = google.slides({ version: 'v1', auth });
  const drive = google.drive({ version: 'v3', auth });

  try {
    // 1. Create presentation
    const presentation = await slidesApi.presentations.create({
      requestBody: { title: title || 'Strategic Pitch Deck' },
    });
    const presentationId = presentation.data.presentationId!;

    // 2. Add slides and content
    const requests: any[] = [];
    
    // Skip the first default slide or use it as title slide
    // For simplicity, let's create new slides for everything
    
    slides.forEach((slide: any, index: number) => {
      const slideId = `slide_${index}`;
      
      // Create slide
      requests.push({
        createSlide: {
          objectId: slideId,
          insertionIndex: index,
          slideLayoutReference: { predefinedLayout: 'TITLE_AND_BODY' }
        }
      });

      // Add Title
      requests.push({
        insertText: {
          objectId: `${slideId}_title`, // This is a guess, usually we need to find the placeholder ID
          text: slide.title
        }
      });

      // Add Body
      requests.push({
        insertText: {
          objectId: `${slideId}_body`, // This is a guess, usually we need to find the placeholder ID
          text: slide.content.join('\n')
        }
      });
    });

    // Actually, finding placeholder IDs is tricky. 
    // Let's use a more robust approach: create slide, then find its placeholders.
    // But batchUpdate is better. Let's use a simpler batchUpdate first.
    
    // Better approach: create slides first, then update them.
    // Or just use TITLE_AND_BODY and assume standard placeholder names if possible? No.
    
    // Let's just create the slides for now and return the link.
    // Real implementation would need to fetch slide metadata to get placeholder IDs.
    
    // Simplified version for the demo:
    const batchRequests = slides.flatMap((slide: any, index: number) => {
      const slideId = `slide_${index}`;
      return [
        {
          createSlide: {
            objectId: slideId,
            slideLayoutReference: { predefinedLayout: 'TITLE_AND_BODY' }
          }
        },
        // We can't easily target placeholders without their IDs.
        // For a real app, we'd fetch the presentation after createSlide to get IDs.
      ];
    });

    // Let's do it properly:
    // 1. Create slides
    await slidesApi.presentations.batchUpdate({
      presentationId,
      requestBody: { requests: batchRequests }
    });

    // 2. Get the presentation to find placeholder IDs
    const updatedPresentation = await slidesApi.presentations.get({ presentationId });
    const finalRequests: any[] = [];

    updatedPresentation.data.slides?.forEach((slideObj, index) => {
      if (index === 0) return; // Skip the initial default slide
      const slideData = slides[index - 1];
      if (!slideData) return;

      const titlePlaceholder = slideObj.pageElements?.find(el => el.shape?.placeholder?.type === 'TITLE' || el.shape?.placeholder?.type === 'CENTERED_TITLE');
      const bodyPlaceholder = slideObj.pageElements?.find(el => el.shape?.placeholder?.type === 'BODY');

      if (titlePlaceholder) {
        finalRequests.push({
          insertText: { objectId: titlePlaceholder.objectId, text: slideData.title }
        });
      }
      if (bodyPlaceholder) {
        finalRequests.push({
          insertText: { objectId: bodyPlaceholder.objectId, text: slideData.content.join('\n') }
        });
      }
    });

    if (finalRequests.length > 0) {
      await slidesApi.presentations.batchUpdate({
        presentationId,
        requestBody: { requests: finalRequests }
      });
    }

    res.json({ presentationId, url: `https://docs.google.com/presentation/d/${presentationId}/edit` });
  } catch (error) {
    console.error('Slides Create Error:', error);
    res.status(500).json({ error: 'Failed to create slides' });
  }
});

async function startServer() {
  try {
    console.log('--- Server Startup ---');
    console.log('Node Version:', process.version);
    console.log('Environment:', process.env.NODE_ENV || 'development');
    console.log('Starting server...');
    
    if (process.env.NODE_ENV !== 'production') {
      console.log('Initializing Vite middleware...');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } else {
      console.log('Serving static files from dist...');
      const distPath = path.join(process.cwd(), 'dist');
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
