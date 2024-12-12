# CheckAPIStatus.ps1

$apiUrl = "https://localhost:7289/api/VerifyAPI/Check" # Replace with your actual endpoint

try {
    $response = Invoke-WebRequest -Uri $apiUrl -UseBasicParsing
    if ($response.StatusCode -ne 200) {
        throw "API is not returning a 200 status code."
    }
} catch {
    # Send a Windows notification
    $msg = "Your .NET Core API has stopped running."
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
    $templateType = [Windows.UI.Notifications.ToastTemplateType]::ToastText01
    $xml = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent($templateType)
    $textNodes = $xml.GetElementsByTagName("text")
    $textNodes.Item(0).AppendChild($xml.CreateTextNode($msg)) > $null
    $toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
    $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("API Monitor")
    $notifier.Show($toast)
}
