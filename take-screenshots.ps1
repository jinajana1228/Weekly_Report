Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$dir = "C:\Users\MUSINSA\Desktop\Vibe Coding\Weely_Report\screenshots"
New-Item -ItemType Directory -Force -Path $dir | Out-Null

function Capture-Url {
  param($url, $filename)
  
  $shell = New-Object -ComObject Shell.Application
  $ie = New-Object -ComObject InternetExplorer.Application
  $ie.Width = 1440
  $ie.Height = 900
  $ie.Visible = $true
  $ie.Navigate($url)
  
  $count = 0
  while ($ie.Busy -and $count -lt 40) {
    Start-Sleep -Milliseconds 500
    $count++
  }
  Start-Sleep -Seconds 3
  
  $hwnd = $ie.HWND
  Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinAPI {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int cmd);
}
"@
  [WinAPI]::SetForegroundWindow($hwnd) | Out-Null
  [WinAPI]::ShowWindow($hwnd, 3) | Out-Null
  Start-Sleep -Seconds 1
  
  $screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $bmp = New-Object System.Drawing.Bitmap($screen.Width, $screen.Height)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen([System.Drawing.Point]::Empty, [System.Drawing.Point]::Empty, $screen.Size)
  $bmp.Save("$dir\$filename")
  $g.Dispose()
  $bmp.Dispose()
  $ie.Quit()
}

Capture-Url "http://localhost:3001/" "01_home.png"
Capture-Url "http://localhost:3001/report/005930" "02_stock_detail.png"
Capture-Url "http://localhost:3001/report/360750" "03_etf_detail.png"
Capture-Url "http://localhost:3001/admin/review" "04_admin_review.png"

Write-Host "Screenshots saved to $dir"
