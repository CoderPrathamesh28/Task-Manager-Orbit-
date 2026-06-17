import re
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
import sqlite3
from app.database import get_db
from app.auth import get_password_hash, verify_password, create_access_token, get_current_user

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

class UserRegister(BaseModel):
    username: str = Field(..., min_length=3, max_length=50, description="Username (3-50 characters)")
    email: str = Field(..., description="Valid email address")
    password: str = Field(..., min_length=6, description="Password (min 6 characters)")

class UserLogin(BaseModel):
    username: str = Field(..., description="Username or Email")
    password: str = Field(..., description="Password")

@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(user_in: UserRegister, db: sqlite3.Connection = Depends(get_db)):
    # Basic validation
    username = user_in.username.strip()
    email = user_in.email.strip().lower()
    
    if not EMAIL_REGEX.match(email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid email format"
        )
        
    if not re.match(r"^[a-zA-Z0-9_-]+$", username):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username must contain only letters, numbers, underscores, or dashes"
        )
        
    cursor = db.cursor()
    
    # Check if username exists
    cursor.execute("SELECT id FROM users WHERE username = ?", (username,))
    if cursor.fetchone():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username is already taken"
        )
        
    # Check if email exists
    cursor.execute("SELECT id FROM users WHERE email = ?", (email,))
    if cursor.fetchone():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email is already registered"
        )
        
    # Hash password and save
    hashed_pwd = get_password_hash(user_in.password)
    try:
        cursor.execute(
            "INSERT INTO users (username, email, hashed_password) VALUES (?, ?, ?)",
            (username, email, hashed_pwd)
        )
        db.commit()
    except sqlite3.Error as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error during registration: {str(e)}"
        )
        
    return {"message": "User registered successfully"}

@router.post("/login")
def login(user_in: UserLogin, db: sqlite3.Connection = Depends(get_db)):
    username_or_email = user_in.username.strip()
    cursor = db.cursor()
    
    # Search by username OR email
    cursor.execute(
        "SELECT id, username, hashed_password FROM users WHERE username = ? OR email = ?",
        (username_or_email, username_or_email.lower())
    )
    user = cursor.fetchone()
    
    if not user or not verify_password(user_in.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password"
        )
        
    # Create token
    access_token = create_access_token(data={"sub": user["username"]})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "username": user["username"]
        }
    }

@router.get("/me")
def read_current_user(current_user: dict = Depends(get_current_user)):
    return current_user
