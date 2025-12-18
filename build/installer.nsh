; Script NSIS personnalisé pour LMU Tracker
; Ce fichier permet d'ajouter des pages et comportements custom à l'installeur

!include "nsDialogs.nsh"
!include "LogicLib.nsh"

!ifndef BUILD_UNINSTALLER
  Var AddDesktopShortcut
  Var AddStartMenuShortcut
  Var ShortcutPageDesktopCheckbox
  Var ShortcutPageStartMenuCheckbox
!endif

!macro customHeader
  ; En-tête personnalisé
  !system "echo 'Configuration de l'installeur LMU Tracker'"
!macroend

!macro customInit
  ; Initialisation personnalisée avant l'installation
  ; Valeurs par défaut : on crée les deux raccourcis, l'utilisateur peut décocher.
  StrCpy $AddDesktopShortcut 1
  StrCpy $AddStartMenuShortcut 1
!macroend

!macro customInstall
  ; Actions supplémentaires pendant l'installation

  ; Créer des raccourcis en utilisant explicitement l'icône .ico livrée avec l'app.
  ; Important: sur Windows, l'icône affichée dans la barre des tâches dépend souvent du raccourci utilisé pour lancer l'app.
  ; Avec asar, l'icône est extraite dans app.asar.unpacked
  StrCpy $0 "$INSTDIR\resources\app.asar.unpacked\LMUTrackerLogo.ico"
  IfFileExists "$0" +2 0
    StrCpy $0 "$INSTDIR\${PRODUCT_FILENAME}.exe"

  ; Raccourci Bureau (optionnel)
  ${If} $AddDesktopShortcut == 1
    CreateShortcut "$DESKTOP\${PRODUCT_NAME}.lnk" "$INSTDIR\${PRODUCT_FILENAME}.exe" "" "$0" 0 SW_SHOWNORMAL "" "Gestionnaire de profils LMU"
  ${EndIf}

  ; Raccourci Menu Démarrer (optionnel)
  ${If} $AddStartMenuShortcut == 1
    CreateDirectory "$SMPROGRAMS\${PRODUCT_NAME}"
    CreateShortcut "$SMPROGRAMS\${PRODUCT_NAME}\${PRODUCT_NAME}.lnk" "$INSTDIR\${PRODUCT_FILENAME}.exe" "" "$0" 0 SW_SHOWNORMAL "" "Gestionnaire de profils LMU"
  ${EndIf}
  
  ; Afficher un message de bienvenue
  MessageBox MB_ICONINFORMATION "Merci d'avoir installé LMU Tracker !$\r$\n$\r$\nL'application vérifiera automatiquement les mises à jour au démarrage."
!macroend

!macro customUnInstall
  ; Actions lors de la désinstallation
  ; Supprimer le raccourci bureau
  Delete "$DESKTOP\${PRODUCT_NAME}.lnk"

  ; Supprimer le raccourci et dossier du menu démarrer
  Delete "$SMPROGRAMS\${PRODUCT_NAME}\${PRODUCT_NAME}.lnk"
  RMDir "$SMPROGRAMS\${PRODUCT_NAME}"
!macroend

!macro customRemoveFiles
  ; Nettoyage de fichiers additionnels si nécessaire
  ; Par exemple, logs ou fichiers temporaires
  RMDir /r "$INSTDIR\logs"
!macroend

; Page personnalisée (optionnel)
!ifndef BUILD_UNINSTALLER
  ; Page de choix des raccourcis (après le choix du dossier d'installation)
  !macro customPageAfterChangeDir
    Page custom ShortcutsPageCreate ShortcutsPageLeave
  !macroend

  Function ShortcutsPageCreate
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}

    ${NSD_CreateLabel} 0u 0u 100% 28u "Raccourcis : choisissez ceux à créer (vous pouvez décocher)."
    Pop $0

    ${NSD_CreateCheckbox} 0u 26u 100% 12u "Créer un raccourci sur le &Bureau"
    Pop $ShortcutPageDesktopCheckbox
    ${If} $AddDesktopShortcut == 1
      ${NSD_Check} $ShortcutPageDesktopCheckbox
    ${EndIf}

    ${NSD_CreateCheckbox} 0u 44u 100% 12u "Créer un raccourci dans le &Menu Démarrer"
    Pop $ShortcutPageStartMenuCheckbox
    ${If} $AddStartMenuShortcut == 1
      ${NSD_Check} $ShortcutPageStartMenuCheckbox
    ${EndIf}

    nsDialogs::Show
  FunctionEnd

  Function ShortcutsPageLeave
    ${NSD_GetState} $ShortcutPageDesktopCheckbox $AddDesktopShortcut
    ${NSD_GetState} $ShortcutPageStartMenuCheckbox $AddStartMenuShortcut
  FunctionEnd
!endif
