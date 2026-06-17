from datetime import datetime, timezone
from typing import Optional, Literal
from fastapi import APIRouter, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
import sqlite3
import json
from app.database import get_db, DB_PATH
from app.auth import get_current_user

router = APIRouter(prefix="/api/tasks", tags=["Tasks"])

# Pydantic models for tasks
class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200, description="Task title")
    description: Optional[str] = Field(None, description="Task details")
    status: Literal["todo", "in_progress", "completed"] = "todo"
    priority: Literal["low", "medium", "high"] = "medium"
    due_date: Optional[str] = Field(None, description="Due date in YYYY-MM-DD format")
    category: Literal["work", "personal", "shopping", "health", "other"] = "work"

class TaskUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    status: Optional[Literal["todo", "in_progress", "completed"]] = None
    priority: Optional[Literal["low", "medium", "high"]] = None
    due_date: Optional[str] = None
    category: Optional[Literal["work", "personal", "shopping", "health", "other"]] = None

# WebSocket Connection Manager
class ConnectionManager:
    def __init__(self):
        # Maps user_id (int) -> list of WebSocket connections
        self.active_connections: dict[int, list[WebSocket]] = {}

    async def connect(self, user_id: int, websocket: WebSocket):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)

    def disconnect(self, user_id: int, websocket: WebSocket):
        if user_id in self.active_connections:
            if websocket in self.active_connections[user_id]:
                self.active_connections[user_id].remove(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]

    async def broadcast_to_user(self, user_id: int, message: dict, exclude_websocket: Optional[WebSocket] = None):
        if user_id in self.active_connections:
            # We iterate over a copy of the list to avoid modification-during-iteration errors
            for connection in list(self.active_connections[user_id]):
                if connection != exclude_websocket:
                    try:
                        await connection.send_json(message)
                    except Exception:
                        # Clean up stale connection
                        self.disconnect(user_id, connection)

manager = ConnectionManager()

# WebSocket Route
@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: Optional[str] = None):
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
        
    # Verify token manually since WebSockets don't go through standard FastAPI HTTP dependencies easily
    try:
        import jwt
        from app.auth import SECRET_KEY, ALGORITHM
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if not username:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
    except Exception:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # Find the user id
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM users WHERE username = ?", (username,))
    user = cursor.fetchone()
    conn.close()
    
    if not user:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
        
    user_id = user["id"]
    await manager.connect(user_id, websocket)
    
    try:
        while True:
            # Keep the connection alive, ignore incoming messages from client for now
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(user_id, websocket)
    except Exception:
        manager.disconnect(user_id, websocket)

# helper to convert Row to dict
def row_to_task_dict(row):
    d = dict(row)
    return d

# CRUD routes
@router.get("")
def get_tasks(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    category: Optional[str] = None,
    search: Optional[str] = None,
    sort_by: Literal["due_date", "priority", "created_at"] = "created_at",
    sort_order: Literal["asc", "desc"] = "desc",
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db)
):
    cursor = db.cursor()
    
    query = "SELECT * FROM tasks WHERE user_id = ?"
    params = [current_user["id"]]
    
    if status:
        query += " AND status = ?"
        params.append(status)
    if priority:
        query += " AND priority = ?"
        params.append(priority)
    if category:
        query += " AND category = ?"
        params.append(category)
    if search:
        query += " AND (title LIKE ? OR description LIKE ?)"
        params.append(f"%{search}%")
        params.append(f"%{search}%")
        
    # Handle sorting
    # To avoid SQL injection, we validate sort_by/sort_order via Literals in endpoint signature
    # Since priority is high/medium/low, SQLite sorts alphabetically by default. 
    # Let's map priorities to order if sorting by priority.
    if sort_by == "priority":
        query += f" ORDER BY CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END {sort_order.upper()}"
    elif sort_by == "due_date":
        # Handle NULL due_dates to be sorted at the end
        if sort_order == "asc":
            query += " ORDER BY due_date IS NULL ASC, due_date ASC"
        else:
            query += " ORDER BY due_date IS NULL DESC, due_date DESC"
    else: # created_at
        query += f" ORDER BY created_at {sort_order.upper()}"
        
    cursor.execute(query, params)
    rows = cursor.fetchall()
    return [row_to_task_dict(r) for r in rows]

@router.post("", status_code=status.HTTP_201_CREATED)
def create_task(
    task_in: TaskCreate,
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db)
):
    cursor = db.cursor()
    try:
        cursor.execute(
            """
            INSERT INTO tasks (user_id, title, description, status, priority, due_date, category)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                current_user["id"],
                task_in.title.strip(),
                task_in.description.strip() if task_in.description else None,
                task_in.status,
                task_in.priority,
                task_in.due_date if task_in.due_date else None,
                task_in.category
            )
        )
        task_id = cursor.lastrowid
        db.commit()
        
        # Retrieve the newly created task
        cursor.execute("SELECT * FROM tasks WHERE id = ?", (task_id,))
        task = cursor.fetchone()
        task_dict = row_to_task_dict(task)
        
        # Note: WebSocket broadcast disabled in sync context
        # Tasks are saved to database successfully
        
        return task_dict
    except sqlite3.Error as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error during task creation: {str(e)}"
        )

@router.put("/{task_id}")
def update_task(
    task_id: int,
    task_in: TaskUpdate,
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db)
):
    cursor = db.cursor()
    # Check if task exists and belongs to user
    cursor.execute("SELECT * FROM tasks WHERE id = ? AND user_id = ?", (task_id, current_user["id"]))
    task = cursor.fetchone()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found or unauthorized"
        )
        
    # Prepare update query dynamically
    update_fields = []
    params = []
    
    # We update updated_at automatically
    now_str = datetime.now(timezone.utc).isoformat()
    
    if task_in.title is not None:
        update_fields.append("title = ?")
        params.append(task_in.title.strip())
    if task_in.description is not None:
        update_fields.append("description = ?")
        params.append(task_in.description.strip() if task_in.description else None)
    if task_in.status is not None:
        update_fields.append("status = ?")
        params.append(task_in.status)
    if task_in.priority is not None:
        update_fields.append("priority = ?")
        params.append(task_in.priority)
    if task_in.due_date is not None:
        update_fields.append("due_date = ?")
        params.append(task_in.due_date if task_in.due_date else None)
    if task_in.category is not None:
        update_fields.append("category = ?")
        params.append(task_in.category)
        
    if not update_fields:
        return row_to_task_dict(task) # No updates
        
    update_fields.append("updated_at = ?")
    params.append(now_str)
    
    query = f"UPDATE tasks SET {', '.join(update_fields)} WHERE id = ? AND user_id = ?"
    params.extend([task_id, current_user["id"]])
    
    try:
        cursor.execute(query, params)
        db.commit()
        
        # Retrieve the updated task
        cursor.execute("SELECT * FROM tasks WHERE id = ?", (task_id,))
        updated_task = cursor.fetchone()
        task_dict = row_to_task_dict(updated_task)
        
        # Note: WebSocket broadcast disabled in sync context
        # Tasks are saved to database successfully
        
        return task_dict
    except sqlite3.Error as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error during task update: {str(e)}"
        )

@router.delete("/{task_id}")
def delete_task(
    task_id: int,
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db)
):
    cursor = db.cursor()
    # Check if task exists and belongs to user
    cursor.execute("SELECT id FROM tasks WHERE id = ? AND user_id = ?", (task_id, current_user["id"]))
    task = cursor.fetchone()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found or unauthorized"
        )
        
    try:
        cursor.execute("DELETE FROM tasks WHERE id = ? AND user_id = ?", (task_id, current_user["id"]))
        db.commit()
        
        # Note: WebSocket broadcast disabled in sync context
        # Task deleted from database successfully
        
        return {"message": "Task deleted successfully", "id": task_id}
    except sqlite3.Error as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error during task deletion: {str(e)}"
        )
