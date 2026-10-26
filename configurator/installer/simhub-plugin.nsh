!macro PitrigFindSimHubIn ID ROOT KEY
  StrCpy $3 0
  pitrig_scan_${ID}:
    EnumRegKey $4 ${ROOT} "${KEY}" $3
    StrCmp $4 "" pitrig_scanned_${ID}
    IntOp $3 $3 + 1
    ReadRegStr $5 ${ROOT} "${KEY}\$4" "DisplayName"
    StrCpy $5 $5 6
    StrCmp $5 "SimHub" 0 pitrig_scan_${ID}
    ReadRegStr $1 ${ROOT} "${KEY}\$4" "InstallLocation"
    StrCpy $5 $1 1 -1
    StrCmp $5 "\" 0 +2
    StrCpy $1 $1 -1
    IfFileExists "$1\SimHubWPF.exe" pitrig_found pitrig_scan_${ID}
  pitrig_scanned_${ID}:
!macroend

!macro PitrigSimHubRunning
  nsExec::ExecToStack '"$SYSDIR\cmd.exe" /c tasklist /NH /FI "IMAGENAME eq SimHubWPF.exe" | find /I "SimHubWPF.exe"'
  Pop $6
  Pop $7
!macroend

!macro customInstall
  Push $0
  Push $1
  Push $2
  Push $3
  Push $4
  Push $5
  Push $6
  Push $7
  Push $8
  Push $9
  StrCpy $8 ""
  StrCpy $0 "$INSTDIR\resources\simhub-plugin\Pitrig.SimHub.dll"
  IfFileExists "$0" 0 pitrig_done
  StrCpy $1 "$PROGRAMFILES32\SimHub"
  IfFileExists "$1\SimHubWPF.exe" pitrig_found
  !insertmacro PitrigFindSimHubIn machine32 HKLM "Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"
  !insertmacro PitrigFindSimHubIn machine HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall"
  !insertmacro PitrigFindSimHubIn user HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall"
  Goto pitrig_done

  pitrig_found:
  ClearErrors
  GetDLLVersion "$0" $2 $3
  IfErrors pitrig_done
  ClearErrors
  GetDLLVersion "$1\Pitrig.SimHub.dll" $4 $5
  IfErrors pitrig_check_running
  StrCmp "$2.$3" "$4.$5" pitrig_done

  pitrig_check_running:
  !insertmacro PitrigSimHubRunning
  StrCmp $6 "0" 0 pitrig_copy
  MessageBox MB_YESNO|MB_ICONQUESTION "SimHub is running. Close it now so the Pitrig plugin can be added to it? SimHub starts again afterwards." /SD IDNO IDNO pitrig_done
  StrCpy $8 "restart"
  nsExec::Exec '"$SYSDIR\taskkill.exe" /IM SimHubWPF.exe'
  Pop $6
  StrCpy $9 0

  pitrig_wait:
  Sleep 500
  !insertmacro PitrigSimHubRunning
  StrCmp $6 "0" 0 pitrig_copy
  IntOp $9 $9 + 1
  IntCmp $9 20 0 pitrig_wait 0
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM SimHubWPF.exe'
  Pop $6
  Sleep 1000
  !insertmacro PitrigSimHubRunning
  StrCmp $6 "0" 0 pitrig_copy
  MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "SimHub is still running. Close it, including its icon in the system tray, then choose Retry." /SD IDCANCEL IDCANCEL pitrig_done
  StrCpy $9 0
  Goto pitrig_wait

  pitrig_copy:
  ClearErrors
  FileOpen $6 "$1\pitrig-write-test.tmp" w
  IfErrors pitrig_elevate
  FileClose $6
  Delete "$1\pitrig-write-test.tmp"
  ClearErrors
  CopyFiles /SILENT "$0" "$1"
  IfErrors 0 pitrig_verify

  pitrig_elevate:
  ExecShellWait "runas" "$SYSDIR\cmd.exe" '/s /c "copy /y "$0" "$1\Pitrig.SimHub.dll""' SW_HIDE

  pitrig_verify:
  ClearErrors
  GetDLLVersion "$1\Pitrig.SimHub.dll" $4 $5
  IfErrors pitrig_failed
  StrCmp "$2.$3" "$4.$5" pitrig_restart

  pitrig_failed:
  MessageBox MB_OK|MB_ICONEXCLAMATION "The Pitrig plugin could not be added to SimHub. To add it by hand, close SimHub and copy $0 next to $1\SimHubWPF.exe." /SD IDOK

  pitrig_restart:
  StrCmp $8 "restart" 0 pitrig_done
  Exec '"$1\SimHubWPF.exe"'

  pitrig_done:
  Pop $9
  Pop $8
  Pop $7
  Pop $6
  Pop $5
  Pop $4
  Pop $3
  Pop $2
  Pop $1
  Pop $0
!macroend
