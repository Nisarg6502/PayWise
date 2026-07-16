"""Google OAuth 2.0 login flow -> JWT.

Flow:
  1. GET /auth/google/login     -> redirect to Google's consent screen
  2. GET /auth/google/callback  -> exchange code, upsert User, mint JWT,
                                   redirect to {frontend}/auth/callback#token=<jwt>
  3. GET /auth/me               -> current user (Bearer JWT)

The token is passed in the URL fragment (not query) so it never reaches
server logs; the Next.js callback page reads it from window.location.hash.
"""

from authlib.integrations.starlette_client import OAuth, OAuthError
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.jwt import create_access_token
from app.core.config import settings
from app.db.session import get_db
from app.models import User

router = APIRouter(prefix="/auth", tags=["auth"])

oauth = OAuth()
oauth.register(
    name="google",
    client_id=settings.google_client_id,
    client_secret=settings.google_client_secret,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)


@router.get("/google/login")
async def google_login(request: Request):
    if not settings.google_client_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google OAuth is not configured (set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)",
        )
    redirect_uri = request.url_for("google_callback")
    return await oauth.google.authorize_redirect(request, redirect_uri)


@router.get("/google/callback", name="google_callback")
async def google_callback(request: Request, db: Session = Depends(get_db)):
    try:
        token = await oauth.google.authorize_access_token(request)
    except OAuthError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc.error))

    userinfo = token.get("userinfo")
    if not userinfo or "email" not in userinfo:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Google did not return a profile"
        )

    email = userinfo["email"]
    name = userinfo.get("name", email.split("@")[0])

    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(email=email, name=name)
        db.add(user)
    else:
        user.name = name  # keep profile name fresh
    db.commit()
    db.refresh(user)

    jwt_token = create_access_token(user_id=str(user.id), email=user.email)
    return RedirectResponse(url=f"{settings.frontend_origin}/auth/callback#token={jwt_token}")


@router.get("/me")
def me(current_user: User = Depends(get_current_user)) -> dict:
    return {
        "id": str(current_user.id),
        "email": current_user.email,
        "name": current_user.name,
        "created_at": current_user.created_at.isoformat(),
    }
