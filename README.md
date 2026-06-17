# Task Manager 📝

A full-stack Task Management web application built with FastAPI, SQLite, and vanilla JavaScript.

## Features ✨

- **User Authentication**: Secure registration and login with JWT tokens
- **Task CRUD**: Create, read, update, and delete tasks
- **Real-time Updates**: WebSocket support for real-time task notifications
- **Task Management**: 
  - Filter by status, priority, category
  - Sort by due date, priority, created date
  - Multiple views: Dashboard, Kanban Board, Task List, Calendar, Analytics
- **Responsive Design**: Works on desktop and mobile devices

## Tech Stack 🛠️

- **Backend**: FastAPI 0.137.1 + Uvicorn 0.49.0
- **Database**: SQLite3
- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Authentication**: JWT (PyJWT 2.13.0)
- **Security**: bcrypt 3.2.2 for password hashing
- **Real-time**: websockets 16.0

## Prerequisites 📋

- Python 3.8+
- pip

## Installation 🚀

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd "Task Manager"
   ```

2. **Create and activate virtual environment**
   ```bash
   python -m venv .venv
   .venv\Scripts\activate  # On Windows
   # source .venv/bin/activate  # On macOS/Linux
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

## Running Locally 🏃

```bash
python -m uvicorn app.main:app --reload
```

Server will start at: **http://127.0.0.1:8000**

## Demo Credentials 👤

```
Username: john_doe
Password: password123

OR

Username: test2user
Password: password123
```

## Project Structure 📁

```
Task Manager/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI app entry point
│   ├── auth.py              # JWT and password utilities
│   ├── database.py          # SQLite connection and schema
│   ├── routes/
│   │   ├── __init__.py
│   │   ├── auth.py          # Login/Register endpoints
│   │   └── tasks.py         # Task CRUD endpoints
│   └── static/
│       ├── index.html       # Frontend UI
│       ├── app.js           # Frontend logic
│       └── styles.css       # Styling
├── requirements.txt         # Python dependencies
└── tasks.db                 # SQLite database (auto-created)
```

## API Endpoints 🔌

### Authentication
- `POST /api/auth/register` - Create new user account
- `POST /api/auth/login` - Login and get JWT token

### Tasks
- `GET /api/tasks` - Get all tasks with filtering/sorting
- `POST /api/tasks` - Create a new task
- `PUT /api/tasks/{task_id}` - Update a task
- `DELETE /api/tasks/{task_id}` - Delete a task
- `WebSocket /api/tasks/ws` - Real-time task updates

## Deployment 🌐

### Deploy on Vercel

1. Push code to GitHub (see below)
2. Go to [Vercel.com](https://vercel.com) and sign in with GitHub
3. Click "New Project"
4. Select your GitHub repository
5. Add environment variables (if needed):
   - `JWT_SECRET` - Your secret key for JWT tokens
6. Click "Deploy"

**Note**: FastAPI with Vercel requires a `vercel.json` configuration (instructions below).

### Deploy on Heroku

```bash
# Install Heroku CLI
# Login and create app
heroku login
heroku create your-app-name

# Push code
git push heroku main
```

### Deploy on Railway

1. Go to [Railway.app](https://railway.app)
2. Connect your GitHub repository
3. Railway auto-detects Python and installs dependencies
4. Deploy!

## Push to GitHub 📤

1. **Create a repository** on [GitHub.com](https://github.com)

2. **Initialize Git** (already done, but here's the command):
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Task Manager app"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/Task-Manager.git
   git push -u origin main
   ```

## Troubleshooting 🔧

### Port 8000 already in use
```bash
# Use a different port
python -m uvicorn app.main:app --reload --port 8001
```

### Database errors
```bash
# Delete tasks.db to reset database
del tasks.db

# Then restart the server to recreate it
python -m uvicorn app.main:app --reload
```

### Authentication errors
Check that:
- Passwords are being hashed with bcrypt
- JWT tokens are valid for 24 hours
- Authorization header format: `Bearer {token}`

## License 📄

MIT License

## Author ✍️

Created with ❤️

---

**Happy task managing!** 🎉
