
        $printer = Get-Printer -Name "TEC B-EV4 Desktop Printer" -ErrorAction SilentlyContinue
        if ($printer) {
          Get-Content "/home/runner/workspace/temp/pass_1756736364970.txt" | Out-Printer -Name "TEC B-EV4 Desktop Printer"
          Write-Output "Success"
        } else {
          Write-Output "Printer not found: TEC B-EV4 Desktop Printer"
          exit 1
        }
      