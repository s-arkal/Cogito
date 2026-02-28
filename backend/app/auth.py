import jwt
import bcrypt

from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlmodel import Session, select
from app.db import get_session, User

SECRET_KEY = "super-secret-deepcite-os-key-change-me" 
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 Days

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a plain text password against its bcrypt hash.
    
    Args:
        plain_password: The plain text password to verify
        hashed_password: The bcrypt hashed password to compare against
    
    Returns:
        True if the password matches the hash, False otherwise
    """
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def get_password_hash(password: str) -> str:
    """
    Generate a bcrypt hash for the given password.
    
    Args:
        password: The plain text password to hash
    
    Returns:
        The bcrypt hashed password as a string
    """
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Create a JWT access token with the provided data.
    
    Args:
        data: Dictionary of claims to include in the token
        expires_delta: Optional timedelta for token expiration. Defaults to 15 minutes if not provided
    
    Returns:
        Encoded JWT token as a string
    """
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_session)) -> User:
    """
    Retrieve the current authenticated user from the JWT token.
    
    Args:
        token: JWT token from the Authorization header
        db: Database session
    
    Returns:
        The User object corresponding to the token
    
    Raises:
        HTTPException: If token is invalid or user cannot be found
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_email: str = payload.get("sub")
        if user_email is None:
            raise credentials_exception
    except jwt.PyJWTError:
        raise credentials_exception
        
    user = db.exec(select(User).where(User.email == user_email)).first()
    if user is None:
        raise credentials_exception
    return user