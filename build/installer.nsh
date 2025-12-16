; Script NSIS personnalisé pour LMU Tracker
; Ce fichier permet d'ajouter des pages et comportements custom à l'installeur

!macro customHeader
  ; En-tête personnalisé
  !system "echo 'Configuration de l'installeur LMU Tracker'"
!macroend

!macro customInit
  ; Initialisation personnalisée avant l'installation
!macroend

!macro customInstall
  ; Actions supplémentaires pendant l'installation

  ; Créer des raccourcis en utilisant explicitement l'icône .ico livrée avec l'app.
  ; Important: sur Windows, l'icône affichée dans la barre des tâches dépend souvent du raccourci utilisé pour lancer l'app.
  ; Avec asar, l'icône est extraite dans app.asar.unpacked
  StrCpy $0 "$INSTDIR\resources\app.asar.unpacked\LMUTrackerLogo.ico"
  IfFileExists "$0" +2 0
    StrCpy $0 "$INSTDIR\${PRODUCT_FILENAME}.exe"

  ; Raccourci Bureau
  CreateShortcut "$DESKTOP\${PRODUCT_NAME}.lnk" "$INSTDIR\${PRODUCT_FILENAME}.exe" "" "$0" 0 SW_SHOWNORMAL "" "Gestionnaire de profils LMU"

  ; Raccourci Menu Démarrer
  CreateDirectory "$SMPROGRAMS\${PRODUCT_NAME}"
  CreateShortcut "$SMPROGRAMS\${PRODUCT_NAME}\${PRODUCT_NAME}.lnk" "$INSTDIR\${PRODUCT_FILENAME}.exe" "" "$0" 0 SW_SHOWNORMAL "" "Gestionnaire de profils LMU"
  
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
; Uncomment pour ajouter une page custom
;!macro customPageAfterChangeDir
;  !insertmacro MUI_PAGE_DIRECTORY
;  Page custom customPage
;!macroend
;
;Function customPage
;  ; Votre page personnalisée ici
;FunctionEnd
