#!/usr/bin/env bash
#
# One-time SES -> SNS -> Chisos webhook setup.
#
# Run with a principal that has SNS write access. The application's runtime
# user (chisos-backend) intentionally does not.
#
#   AWS_PROFILE=admin ./scripts/setup_ses_sns.sh
#
set -euo pipefail

REGION="${AWS_REGION:-us-east-2}"
CONFIG_SET="${SES_CONFIGURATION_SET:-my-first-configuration-set}"
ENDPOINT="${SNS_ENDPOINT:-https://api.chisos.xyz/api/webhooks/sns}"
TOPIC_NAME="${SNS_TOPIC_NAME:-chisos-ses-events}"

echo "Region:          $REGION"
echo "Configuration:   $CONFIG_SET"
echo "Webhook:         $ENDPOINT"
echo

TOPIC_ARN=$(aws sns create-topic \
  --name "$TOPIC_NAME" \
  --region "$REGION" \
  --query TopicArn \
  --output text)
echo "Created topic:   $TOPIC_ARN"

aws sns subscribe \
  --topic-arn "$TOPIC_ARN" \
  --protocol https \
  --notification-endpoint "$ENDPOINT" \
  --region "$REGION" >/dev/null
echo "Subscribed:      $ENDPOINT"

aws sesv2 create-configuration-set-event-destination \
  --configuration-set-name "$CONFIG_SET" \
  --event-destination-name chisos-sns \
  --event-destination "{\"Enabled\":true,\"Name\":\"chisos-sns\",\"MatchingEventTypes\":[\"BOUNCE\",\"COMPLAINT\"],\"SnsDestination\":{\"TopicARN\":\"$TOPIC_ARN\"}}" \
  --region "$REGION" >/dev/null
echo "SES events:      BOUNCE, COMPLAINT -> SNS"

cat <<EOF

Done. Now point the service at the topic:

  railway variables -s advanced-notes --set SES_SNS_TOPIC_ARN=$TOPIC_ARN
  railway variables -s advanced-notes --set SES_SNS_AUTO_CONFIRM=true

The next delivery confirms the subscription automatically. To confirm
manually instead, click the link in the subscription email.
EOF
