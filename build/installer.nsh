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
  
  ; Créer un raccourci sur le bureau avec une description
  CreateShortcut "$DESKTOP\${PRODUCT_NAME}.lnk" "$INSTDIR\${PRODUCT_FILENAME}.exe" "" "$INSTDIR\${PRODUCT_FILENAME}.exe" 0 SW_SHOWNORMAL "" "Gestionnaire de profils LMU"
  
  ; Afficher un message de bienvenue
  MessageBox MB_ICONINFORMATION "Merci d'avoir installé LMU Tracker !$\r$\n$\r$\nL'application vérifiera automatiquement les mises à jour au démarrage."
!macroend

!macro customUnInstall
  ; Actions lors de la désinstallation
  ; Supprimer le raccourci bureau
  Delete "$DESKTOP\${PRODUCT_NAME}.lnk"
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
