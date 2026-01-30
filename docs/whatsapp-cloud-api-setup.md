# WhatsApp Cloud API Setup Guide

This guide outlines the process for setting up the Meta WhatsApp Cloud API and provides a detailed feature gap analysis comparing the legacy `whatsapp-web.js` implementation with the official Cloud API.

## Prerequisites

- **Meta Developer Account**: Register at [developers.facebook.com](https://developers.facebook.com).
- **Meta Business Account**: Required for production use and higher messaging limits.
- **Business Verification**: Necessary to move out of the "Sandbox" mode and increase rate limits.
- **Valid SSL Webhook URL**: Meta requires an HTTPS endpoint for webhooks.

## Step-by-Step Setup

### 1. Create Meta Developer Account

- Go to [Meta for Developers](https://developers.facebook.com) and log in with your Facebook account.
- Complete the registration process to become a Meta Developer.

### 2. Business Verification

- Navigate to the [Meta Business Suite](https://business.facebook.com).
- Go to **Security Center** and start the verification process.
- Provide legal documentation for your business (e.g., tax ID, utility bills).
- _Note: You can start development in "Sandbox" mode without verification._

### 3. Phone Number Registration

- In your Meta App dashboard, add the **WhatsApp** product.
- Go to **WhatsApp > Setup**.
- You can use the provided test number or register a new business phone number.
- _Warning: Once a number is registered with the Cloud API, it cannot be used with the standard WhatsApp mobile app._

### 4. Webhook Configuration

- Go to **WhatsApp > Configuration**.
- Set the **Callback URL** to your server's webhook endpoint (e.g., `https://your-domain.com/whatsapp/webhook`).
- Set the **Verify Token** (must match `WHATSAPP_VERIFY_TOKEN` in `.env`).
- Subscribe to the following fields: `messages`, `message_deliveries`, `message_reads`.

### 5. API Token Generation

- For development, use the **Temporary Access Token** provided in the Getting Started panel (expires in 24 hours).
- For production, create a **System User** in your Business Manager and generate a **Permanent Access Token**.

---

## Feature Gap Analysis

| Feature                  | whatsapp-web.js Support          | Cloud API Support                | Impact                                                                   |
| ------------------------ | -------------------------------- | -------------------------------- | ------------------------------------------------------------------------ |
| **Stability**            | Low (Puppeteer/Chrome dependent) | High (Official REST API)         | Cloud API is significantly more reliable for production.                 |
| **Authentication**       | QR Code Scan (Session-based)     | API Token (Bearer)               | Cloud API is easier to automate and manage programmatically.             |
| **Interactive Messages** | Fallback to Text Menus           | Native Buttons/Lists             | Cloud API provides a superior UX with native UI components.              |
| **Group Management**     | Full (Direct Add/Remove)         | Restricted (Invite-only)         | Major change in onboarding flow; requires OBA for full access.           |
| **Message Templates**    | Not Required                     | Required for Business-Initiated  | Increases complexity and cost for outbound notifications.                |
| **Cost**                 | Free (Infrastructure only)       | Conversation-based Pricing       | Cloud API has per-conversation costs after the free tier.                |
| **Media Handling**       | Local Buffer/File                | Upload/Download via Meta Servers | Cloud API requires an extra step for media (upload first, then send ID). |

---

## Group Feature Parity Truth Table

| Feature                | whatsapp-web.js Behavior          | Cloud API Behavior                         | Parity Classification |
| ---------------------- | --------------------------------- | ------------------------------------------ | --------------------- |
| **Create Group**       | Direct creation with participants | Create group, returns invite link          | **degraded**          |
| **Add Participant**    | Direct addition to group          | Send invite link to user                   | **degraded**          |
| **Remove Participant** | Direct removal                    | Supported via API                          | **full**              |
| **Send Message**       | Send to JID (`12345@g.us`)        | Send to Group ID (Requires OBA/100k limit) | **degraded**          |
| **Receive Message**    | Webhook with group JID            | Webhook with group ID                      | **full**              |
| **Update Metadata**    | Direct update (Subject, Desc)     | Supported via API                          | **full**              |
| **Admin Actions**      | Promote/Demote directly           | Supported via API                          | **full**              |

---

## Webhook Payload Formats

### Text Message

```json
{
  "from": "1234567890",
  "id": "wamid.HBgLMTIzNDU2Nzg5MBUCABIYFjNFREU0M0Y0RDVGM0U0RTU0RTU0RTU0",
  "timestamp": "1670000000",
  "text": { "body": "Hello World" },
  "type": "text"
}
```

### Media (Image/Document/Audio)

```json
{
  "from": "1234567890",
  "id": "wamid...",
  "timestamp": "1670000000",
  "type": "image",
  "image": {
    "caption": "Check this out",
    "mime_type": "image/jpeg",
    "sha256": "...",
    "id": "MEDIA_ID"
  }
}
```

### Interactive (Button Reply)

```json
{
  "from": "1234567890",
  "id": "wamid...",
  "timestamp": "1670000000",
  "type": "interactive",
  "interactive": {
    "type": "button_reply",
    "button_reply": { "id": "btn_yes", "title": "Yes" }
  }
}
```

---

## Rate Limits and Constraints

### Messaging Tiers

- **Tier 1**: 1,000 business-initiated conversations per 24 hours.
- **Tier 2**: 10,000 business-initiated conversations per 24 hours.
- **Tier 3**: 100,000 business-initiated conversations per 24 hours.
- **Tier 4**: Unlimited business-initiated conversations per 24 hours.

### 24-Hour Window

- Businesses can only send free-form messages within 24 hours of the last user message.
- Outside this window, only **Pre-approved Templates** can be sent.

---

## Media Handling

1. **Upload**: `POST /v18.0/{phone-number-id}/media` with `file` and `messaging_product=whatsapp`. Returns a `media_id`.
2. **Send**: Use the `media_id` in a message payload (e.g., `image: { id: "MEDIA_ID" }`).
3. **Download**: `GET /v18.0/{media-id}` to get the download URL, then `GET` the URL with the Access Token.

---

## Environment Variables

Must match `src/config/configuration.ts` patterns:

```env
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_ACCESS_TOKEN=your_permanent_access_token
WHATSAPP_VERIFY_TOKEN=your_webhook_verify_token
WHATSAPP_APP_SECRET=your_app_secret
WHATSAPP_WEBHOOK_URL=https://your-domain.com/whatsapp/webhook
```

---

## Meta API Readiness Checklist (Human Pre-Requisites)

Before Task 10 can be tested end-to-end:

- [ ] Meta Developer account created at developers.facebook.com
- [ ] Meta Business verified
- [ ] WhatsApp Business app created
- [ ] Phone number registered
- [ ] Permanent access token generated (System User token)
- [ ] Webhook URL configured (matches WHATSAPP_WEBHOOK_URL)
- [ ] Webhook verify token set (matches WHATSAPP_VERIFY_TOKEN)
- [ ] Webhook subscriptions enabled: messages, message_deliveries, message_reads
- [ ] App secret noted (for X-Hub-Signature-256)
- [ ] Test message sent from Meta's test console → webhook received
      NOTE: Task 10 unit tests use mocked payloads. This checklist is for integration testing only.
