use crate::state::{AirState, PlanState};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use chrono::{DateTime, Duration, Utc};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use tauri::State;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Claims {
    product: String,
    plan: String,
    subject: String,
    issued_at: String,
    expires_at: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Verified {
    plan: String,
    expires_at: Option<String>,
}
#[tauri::command]
pub fn license_verify(state: State<'_, AirState>, token: String) -> Result<Verified, String> {
    let raw = option_env!("SUSH_AIR_LICENSE_PUBLIC_KEY")
        .ok_or("This build has no Air license public key.")?;
    let key: [u8; 32] = URL_SAFE_NO_PAD
        .decode(raw.trim())
        .map_err(|_| "Invalid public key")?
        .try_into()
        .map_err(|_| "Invalid public key length")?;
    let claims = verify(
        &token,
        &VerifyingKey::from_bytes(&key).map_err(|_| "Invalid public key")?,
    )?;
    let out = Verified {
        plan: claims.plan.clone(),
        expires_at: claims.expires_at.clone(),
    };
    state.set_plan(PlanState {
        plan: claims.plan,
        expires_at: claims.expires_at,
    });
    Ok(out)
}
fn verify(token: &str, key: &VerifyingKey) -> Result<Claims, String> {
    if token.len() > 8192 {
        return Err("Token too large".into());
    }
    let parts: Vec<_> = token.trim().split('.').collect();
    if parts.len() != 2 {
        return Err("Invalid token".into());
    }
    let payload = URL_SAFE_NO_PAD
        .decode(parts[0])
        .map_err(|_| "Invalid token")?;
    let sig = URL_SAFE_NO_PAD
        .decode(parts[1])
        .map_err(|_| "Invalid signature")?;
    key.verify(
        parts[0].as_bytes(),
        &Signature::from_slice(&sig).map_err(|_| "Invalid signature")?,
    )
    .map_err(|_| "Signature verification failed")?;
    let c: Claims = serde_json::from_slice(&payload).map_err(|_| "Invalid claims")?;
    if c.product != "sush-air"
        || c.subject.trim().is_empty()
        || c.subject.len() > 160
        || !matches!(
            c.plan.as_str(),
            "air-monthly" | "air-lifetime" | "pro" | "max"
        )
    {
        return Err("License does not include Sush Air".into());
    }
    let issued: DateTime<Utc> = c.issued_at.parse().map_err(|_| "Invalid issue date")?;
    if issued > Utc::now() + Duration::minutes(5) {
        return Err("Future issue date".into());
    }
    match (c.plan.as_str(), c.expires_at.as_deref()) {
        ("air-lifetime", Some(_)) => return Err("Lifetime license cannot expire".into()),
        ("air-monthly" | "pro" | "max", None) => {
            return Err("Recurring entitlement must expire".into())
        }
        _ => {}
    }
    if let Some(x) = &c.expires_at {
        let expiry: DateTime<Utc> = x.parse().map_err(|_| "Invalid expiry")?;
        if expiry <= Utc::now() {
            return Err("License expired".into());
        }
    }
    Ok(c)
}
