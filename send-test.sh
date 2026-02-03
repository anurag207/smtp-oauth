#!/bin/bash
# =============================================================================
# SMTP to Gmail OAuth Relay - Test Script
# =============================================================================
#
# Usage: ./send-test.sh recipient@example.com "Test subject" "Test body"
#
# Prerequisites:
#   1. Configure TEST_SENDER_EMAIL and TEST_SENDER_API_KEY in .env
#   2. Start the relay server: npm run dev
#
# =============================================================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if correct number of arguments provided
if [ "$#" -ne 3 ]; then
    echo -e "${YELLOW}SMTP to Gmail OAuth Relay - Test Script${NC}"
    echo ""
    echo "Usage: ./send-test.sh <recipient> <subject> <body>"
    echo ""
    echo "Arguments:"
    echo "  recipient - Email address to send to"
    echo "  subject   - Email subject line"
    echo "  body      - Email body content"
    echo ""
    echo "Example:"
    echo "  ./send-test.sh john@example.com \"Hello\" \"This is a test email\""
    echo ""
    echo "Prerequisites:"
    echo "  1. Add to your .env file:"
    echo "     TEST_SENDER_EMAIL=your-registered@gmail.com"
    echo "     TEST_SENDER_API_KEY=sk_your_api_key"
    echo "  2. Start the relay server: npm run dev"
    exit 1
fi

# Load environment variables from .env file if it exists
if [ -f .env ]; then
    while IFS='=' read -r key value; do
        # Skip comments and empty lines
        [[ "$key" =~ ^#.*$ ]] && continue
        [[ -z "$key" ]] && continue
        # Remove leading/trailing whitespace from key and value
        key=$(echo "$key" | xargs)
        value=$(echo "$value" | xargs)
        # Only export if key is valid
        if [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
            export "$key=$value"
        fi
    done < .env
fi

# Get sender credentials from environment
SENDER_EMAIL="${TEST_SENDER_EMAIL:-}"
SENDER_API_KEY="${TEST_SENDER_API_KEY:-}"

# Validate credentials are set
if [ -z "$SENDER_EMAIL" ]; then
    echo -e "${RED}Error: TEST_SENDER_EMAIL not set in .env file${NC}"
    echo ""
    echo "Add these lines to your .env file:"
    echo "  TEST_SENDER_EMAIL=your-registered@gmail.com"
    echo "  TEST_SENDER_API_KEY=sk_your_api_key"
    exit 1
fi

if [ -z "$SENDER_API_KEY" ]; then
    echo -e "${RED}Error: TEST_SENDER_API_KEY not set in .env file${NC}"
    echo ""
    echo "Add these lines to your .env file:"
    echo "  TEST_SENDER_EMAIL=your-registered@gmail.com"
    echo "  TEST_SENDER_API_KEY=sk_your_api_key"
    exit 1
fi

# Arguments
RECIPIENT="$1"
SUBJECT="$2"
BODY="$3"

# Validate recipient email format (basic check)
if [[ ! "$RECIPIENT" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]]; then
    echo -e "${RED}Error: Invalid recipient email format${NC}"
    exit 1
fi

echo -e "${GREEN}Sending test email...${NC}"
echo "  From:    $SENDER_EMAIL"
echo "  To:      $RECIPIENT"
echo "  Subject: $SUBJECT"
echo ""

# Run the TypeScript test script
npx ts-node scripts/send-test.ts "$SENDER_EMAIL" "$SENDER_API_KEY" "$RECIPIENT" "$SUBJECT" "$BODY"

# Capture exit code
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ Test completed successfully!${NC}"
else
    echo ""
    echo -e "${RED}❌ Test failed with exit code $EXIT_CODE${NC}"
fi

exit $EXIT_CODE
