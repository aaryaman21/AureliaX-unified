from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr, Field
from typing import Optional

from api.services.sms_service import (
    otp_store,
    generate_otp,
    format_to_e164,
    send_sms_otp_twilio,
    send_email_otp,
)

router = APIRouter(prefix="/otp", tags=["OTP Verification"])


class SendPhoneOtpRequest(BaseModel):
    phone: str = Field(..., description="Recipient phone number (e.g. +91 98765 43210 or 1234567890)")


class VerifyPhoneOtpRequest(BaseModel):
    phone: str
    otp: str


class SendEmailOtpRequest(BaseModel):
    email: str


class VerifyEmailOtpRequest(BaseModel):
    email: str
    otp: str


@router.post("/send-phone")
async def send_phone_otp(req: SendPhoneOtpRequest):
    digits = "".join(c for c in req.phone if c.isdigit())
    if len(digits) < 10:
        raise HTTPException(status_code=400, detail="Invalid phone number: Must contain at least 10 digits.")

    e164_phone = format_to_e164(req.phone)
    otp = generate_otp(6)
    otp_store.set_otp(e164_phone, otp)

    result = send_sms_otp_twilio(e164_phone, otp)
    if not result.get("success") and result.get("provider") == "twilio":
        # If Twilio failed, raise 502 with detail
        raise HTTPException(status_code=502, detail=result.get("error", "Twilio gateway failed to deliver SMS."))

    return result


@router.post("/verify-phone")
async def verify_phone_otp(req: VerifyPhoneOtpRequest):
    e164_phone = format_to_e164(req.phone)
    valid, message = otp_store.verify_and_clear(e164_phone, req.otp)
    if not valid:
        raise HTTPException(status_code=400, detail=message)
    return {"success": True, "message": message, "phone": e164_phone}


@router.post("/send-email")
async def send_email_otp_endpoint(req: SendEmailOtpRequest):
    email = req.email.strip().lower()
    if "@" not in email or "." not in email:
        raise HTTPException(status_code=400, detail="Invalid email format.")

    otp = generate_otp(6)
    otp_store.set_otp(email, otp)

    result = send_email_otp(email, otp)
    return result


@router.post("/verify-email")
async def verify_email_otp_endpoint(req: VerifyEmailOtpRequest):
    email = req.email.strip().lower()
    valid, message = otp_store.verify_and_clear(email, req.otp)
    if not valid:
        raise HTTPException(status_code=400, detail=message)
    return {"success": True, "message": message, "email": email}
