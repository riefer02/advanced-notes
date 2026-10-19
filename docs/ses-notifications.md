# SES Admin Notifications

Admin notifications are queued in `email_outbox` and delivered by a background
worker in each Gunicorn process. Delivery problems come back through SNS.

## Architecture

```
request ──enqueue──▶ email_outbox ──worker──▶ SES ──▶ admin inbox
                                        │
SES ──bounce/complaint──▶ SNS ──HTTPS──▶ /api/webhooks/sns
                                            │
                                      email_events + admin alert
```

- `POST /api/webhooks/sns` is unauthenticated but verifies the SNS signature,
  the signing certificate host, the topic ARN, and message age.
- Permanent bounces and complaints queue an admin alert. Alerts caused by an
  admin address are recorded but not re-sent, preventing loops.

## Configuration

| Variable | Purpose |
|---|---|
| `ADMIN_EMAIL` / `ADMIN_EMAILS` | Recipient(s); `ADMIN_EMAILS` is comma-separated and overrides `ADMIN_EMAIL` |
| `SES_REGION` | SES/SNS region |
| `SES_SENDER_EMAIL` | Verified sender identity |
| `SES_CONFIGURATION_SET` | **Required for bounce/complaint events** |
| `SES_SNS_TOPIC_ARN` | Topic the webhook accepts messages from (required) |
| `SES_SNS_AUTO_CONFIRM` | Auto-confirm the SNS subscription (`false` by default) |
| `SES_SNS_MAX_MESSAGE_AGE_SECONDS` | Replay window (default 3600) |
| `NEW_USER_NOTIFICATION_MODE` | `instant` (default), `digest`, or `off` |

Without `SES_SNS_TOPIC_ARN`, the webhook rejects every message with `403`.

## One-time AWS setup

Run these with a principal that has SNS permissions. The application's runtime
user (`chisos-backend`) only needs SES send access; it does not manage SNS.

```bash
REGION=us-east-2
TOPIC_ARN=$(aws sns create-topic --name chisos-ses-events --region "$REGION" \
  --query TopicArn --output text)

aws sns subscribe \
  --topic-arn "$TOPIC_ARN" \
  --protocol https \
  --notification-endpoint https://api.chisos.xyz/api/webhooks/sns \
  --region "$REGION"

# Forward SES events to SNS (must be the same configuration set used for sends)
aws sesv2 create-configuration-set-event-destination \
  --configuration-set-name my-first-configuration-set \
  --event-destination-name chisos-sns \
  --event-destination Enabled=true,Name=chisos-sns, \
MatchingEventTypes=bounce,complaint, \
SnsDestination={TopicARN="$TOPIC_ARN"} \
  --region "$REGION"
```

Then set on the service and redeploy:

```
SES_CONFIGURATION_SET=my-first-configuration-set
SES_SNS_TOPIC_ARN=<topic arn>
```

Finally confirm the subscription — set `SES_SNS_AUTO_CONFIRM=true` and let the
next delivery confirm it, or click the link in the confirmation email.

## IAM policy for the setup principal

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "sns:CreateTopic",
        "sns:Subscribe",
        "sns:ListTopics",
        "sns:GetTopicAttributes"
      ],
      "Resource": "arn:aws:sns:us-east-2:134762714530:*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "sesv2:CreateConfigurationSetEventDestination",
        "sesv2:GetConfigurationSetEventDestinations",
        "sesv2:UpdateConfigurationSetEventDestination"
      ],
      "Resource": "*"
    }
  ]
}
```

## Verifying

```bash
# Unsigned input must be rejected
curl -i -X POST https://api.chisos.xyz/api/webhooks/sns \
  -H 'Content-Type: application/json' -d '{}'
# → 403 {"error":"invalid signature"}

# Rows recorded after a real event
# email_events: sns_message_id, event_type, subtype, recipients, detail
```
