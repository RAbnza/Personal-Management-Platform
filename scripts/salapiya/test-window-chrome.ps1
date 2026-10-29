param(
  [Parameter(Mandatory = $true)][int]$TargetProcessId,
  [Parameter(Mandatory = $true)][ValidateSet('light', 'dark')][string]$Theme
)
$ErrorActionPreference = 'Stop'
$process = Get-Process -Id $TargetProcessId
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$allowed = [IO.Path]::GetFullPath((Join-Path $repo 'apps/salapiya/build/windows/'))
if ($process.ProcessName -ne 'salapiya' -or !$process.Path.StartsWith($allowed, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Only the explicitly identified repository test runner may be exercised.'
}
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class CaptionProbe {
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out Rect r);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out Rect r);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int mode);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int w, int height, uint flags);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int index);
  [DllImport("user32.dll")] public static extern IntPtr GetClassLongPtr(IntPtr h, int index);
  [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr h);
}
'@
function Assert-Window($condition, $message) { if (!$condition) { throw $message } }
$window = $process.MainWindowHandle
Assert-Window ($window -ne [IntPtr]::Zero) 'Runner window unavailable'
$style = [CaptionProbe]::GetWindowLong($window, -16)
Assert-Window (($style -band 0x00CF0000) -eq 0x00CF0000) 'Standard caption, resize and system controls must remain'
Assert-Window ([CaptionProbe]::GetClassLongPtr($window, -14) -ne [IntPtr]::Zero) 'Native application icon missing'
$original = New-Object CaptionProbe+Rect
[void][CaptionProbe]::GetWindowRect($window, [ref]$original)
try {
  [void][CaptionProbe]::ShowWindow($window, 6)
  Assert-Window ([CaptionProbe]::IsIconic($window)) 'Minimize failed'
  [void][CaptionProbe]::ShowWindow($window, 9)
  [void][CaptionProbe]::ShowWindow($window, 3)
  Assert-Window ([CaptionProbe]::IsZoomed($window)) 'Maximize failed'
  [void][CaptionProbe]::ShowWindow($window, 9)
  Assert-Window (![CaptionProbe]::IsZoomed($window)) 'Restore failed'
  [void][CaptionProbe]::SetWindowPos($window, [IntPtr]::Zero, 80, 80, 960, 700, 0x14)
  $rect = New-Object CaptionProbe+Rect
  [void][CaptionProbe]::GetWindowRect($window, [ref]$rect)
  Assert-Window (($rect.Right - $rect.Left) -eq 960) 'Resize failed'
  $dpi = [CaptionProbe]::GetDpiForWindow($window)
  $x = $rect.Left + [int](160 * $dpi / 96)
  $y = $rect.Top + [int](16 * $dpi / 96)
  $point = [IntPtr](($y -shl 16) -bor ($x -band 65535))
  $hit = [CaptionProbe]::SendMessage($window, 0x84, [IntPtr]::Zero, $point)
  Assert-Window ($hit.ToInt32() -eq 2) 'Caption must retain native draggable hit testing'
  [void][CaptionProbe]::SendMessage($window, 0xA3, [IntPtr]2, $point)
  Assert-Window ([CaptionProbe]::IsZoomed($window)) 'Caption double-click maximize failed'
  [void][CaptionProbe]::SendMessage($window, 0xA3, [IntPtr]2, $point)
  Assert-Window (![CaptionProbe]::IsZoomed($window)) 'Caption double-click restore failed'
  [void][CaptionProbe]::SendMessage($window, 0x1A, [IntPtr]::Zero, [IntPtr]::Zero)
  Write-Output "PASS: $Theme caption/icon/system-menu style/minimize/maximize/restore/resize/native caption hit test/double-click; DPI=$dpi"
} finally {
  [void][CaptionProbe]::ShowWindow($window, 9)
  [void][CaptionProbe]::SetWindowPos($window, [IntPtr]::Zero, $original.Left, $original.Top, ($original.Right-$original.Left), ($original.Bottom-$original.Top), 0x14)
}
