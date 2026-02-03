# =============================================================================
# SMTP to Gmail OAuth Relay - Test Script (Windows PowerShell)
# =============================================================================
#
# Usage: .\send-test.ps1 recipient@example.com "Test subject" "Test body"
#
# Prerequisites:
#   1. Configure TEST_SENDER_EMAIL and TEST_SENDER_API_KEY in .env
#   2. Start the relay server: npm run dev
#
# =============================================================================

param(
    [Parameter(Position=0)]
    [string]$Recipient,
    
    [Parameter(Position=1)]
    [string]$Subject,
    
    [Parameter(Position=2)]
    [string]$Body
)

# Show usage if no arguments or help requested
if (-not $Recipient -or -not $Subject -or -not $Body) {
    Write-Host "SMTP to Gmail OAuth Relay - Test Script" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Usage: .\send-test.ps1 <recipient> <subject> <body>"
    Write-Host ""
    Write-Host "Arguments:"
    Write-Host "  recipient - Email address to send to"
    Write-Host "  subject   - Email subject line"
    Write-Host "  body      - Email body content"
    Write-Host ""
    Write-Host "Example:"
    Write-Host '  .\send-test.ps1 john@example.com "Hello" "This is a test email"'
    Write-Host ""
    Write-Host "Prerequisites:"
    Write-Host "  1. Add to your .env file:"
    Write-Host "     TEST_SENDER_EMAIL=your-registered@gmail.com"
    Write-Host "     TEST_SENDER_API_KEY=sk_your_api_key"
    Write-Host "  2. Start the relay server: npm run dev"
    exit 1
}

# Load .env file
if (Test-Path .env) {
    Get-Content .env | ForEach-Object {
        if ($_ -match '^([^#][^=]+)=(.*)$') {
            [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), 'Process')
        }
    }
}

# Get credentials from environment
$SenderEmail = $env:TEST_SENDER_EMAIL
$SenderApiKey = $env:TEST_SENDER_API_KEY

# Validate credentials
if (-not $SenderEmail) {
    Write-Host "Error: TEST_SENDER_EMAIL not set in .env file" -ForegroundColor Red
    Write-Host ""
    Write-Host "Add these lines to your .env file:"
    Write-Host "  TEST_SENDER_EMAIL=your-registered@gmail.com"
    Write-Host "  TEST_SENDER_API_KEY=sk_your_api_key"
    exit 1
}

if (-not $SenderApiKey) {
    Write-Host "Error: TEST_SENDER_API_KEY not set in .env file" -ForegroundColor Red
    Write-Host ""
    Write-Host "Add these lines to your .env file:"
    Write-Host "  TEST_SENDER_EMAIL=your-registered@gmail.com"
    Write-Host "  TEST_SENDER_API_KEY=sk_your_api_key"
    exit 1
}

# Validate recipient email format
if ($Recipient -notmatch '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$') {
    Write-Host "Error: Invalid recipient email format" -ForegroundColor Red
    exit 1
}

Write-Host "Sending test email..." -ForegroundColor Green
Write-Host "  From:    $SenderEmail"
Write-Host "  To:      $Recipient"
Write-Host "  Subject: $Subject"
Write-Host ""

# Run the TypeScript test script
npx ts-node scripts/send-test.ts $SenderEmail $SenderApiKey $Recipient $Subject $Body

# Check exit code
if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "Test completed successfully!" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "Test failed with exit code $LASTEXITCODE" -ForegroundColor Red
}

exit $LASTEXITCODE

