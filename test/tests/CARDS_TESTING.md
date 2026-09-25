# Kaarten: gerichte controle

Release: 0.31.10-test.120. Productiebestanden zijn niet gewijzigd.

## Automatische test

`cards-regression.cjs` gebruikt Node, jsdom 26.1.0 en sharp. Installeer de testafhankelijkheden in een tijdelijke map (niet in productie):

```sh
npm install --prefix /tmp/log-cards-tests --ignore-scripts --no-save jsdom@26.1.0 sharp
NODE_PATH=/tmp/log-cards-tests/node_modules node test/tests/cards-regression.cjs
node test/tests/ride-detour-one-tap-regression.cjs
node test/tests/gps-track-resume-regression.cjs
node test/tests/shell-header-regression.cjs
```

De test leest gegenereerde QR-, Code128- en EAN13-SVG's opnieuw met de scannerdecoder; controleert Unicode en voorloopnullen, titels en kleur, hoofd-/sublocatiefilters, nabije locaties, duplicaten, opslagfouten, cameraweigering, late cameratoestemming, stoppen bij navigatie en behoud in de complete back-up/hersteldata. DOM-tests simuleren camera en GPS; dit is geen fysieke cameratest.

## Controle op iPhone in testomgeving

1. Open Kaarten. Maak een QR-code met titel/kleur en een sublocatie. Controleer voorbeeld en opgeslagen kaart.
2. Maak een Code128-kaart met `000123456789`. Heropen de PWA en controleer beide kaarten, inhoud en kleur.
3. Scan een bestaande QR-code en barcode; sla de gelezen inhoud met titel/kleur/locatie op. Probeer ook een foto.
4. Weiger cameratoegang en controleer de uitleg en foto-optie. Sluit tijdens het openen van de camera en controleer dat de camera-indicator verdwijnt.
5. Wissel naar een andere module of zet de app op de achtergrond; camera moet stoppen. Hervat met de knop.
6. Filter op hoofdlocatie en sublocatie, zoek op titel of inhoud en probeer In de buurt. GPS vraagt alleen na aantikken toestemming; alle kaarten blijven bereikbaar bij weigering.
7. Exporteer een volledige back-up. Herstel uitsluitend in een afzonderlijke lege testinstallatie en controleer kaarten en locatiekoppelingen.

Codes kopiëren de tekstinhoud, niet de beveiliging of geldigheid van een originele pas. Dynamische/tijdgebonden codes kunnen na verloop van tijd ongeldig worden.

Test .114 voegt synthetische cameraframes toe: QR en Code128 worden met de echte decoder gelezen en naar het formulier overgedragen, inclusief vertraagde videoafmetingen en zichtbare herstart na leesfouten. Camera start bij Code scannen; Camera opnieuw starten blijft beschikbaar bij fouten.

Test .117: `module-swipe-regression.cjs` controleert korte/lange veeg, annuleren, verticaal scrollen, globale en lokale uitschakeling, blokkering van oude knoppen en de actievolgorde. Kaarttest controleert gedeeld swipegedrag en afwezig codetype. Controleer op iPhone per module de regelhoogte, korte/lange veeg en Algemene instellingen → App → Bediening. Ook met uitschakeling moet bewerken beschikbaar blijven.

Test .119: `scan-actions-regression.cjs` controleert bekende/onbekende en meervoudige matches, voorloopnullen, opgeslagen actieconfiguratie, bevestiging, ontbrekende locaties/thema’s, lopende/te voltooien taken en opslagfouten. De cameraframetest controleert herkenning van bestaande QR- en barcodekaarten. Controleer op iPhone scannen → herkenning → actie, inclusief een sublocatie en een al lopende taak.

Test .120: `log-code-regression.cjs` controleert schema/versie, verwijzingen, importpreview, bestaande gegevens, herhaalde scans, herstel na gedeeltelijke opslagfout en taak-/ritstarters. `cards-regression.cjs` maakt via de echte invoer een Log-QR, leest die terug met ZXing en voert een synthetisch cameraframe door de scanroute naar het importscherm. Op iPhone: Kaarten → Log-QR met gegevens en starters; maak een code, scan op een tweede testinstallatie, bevestig de gegevens, probeer beide starters en herhaal de scan. Procedures met meerdere stappen zijn nog niet geïmplementeerd.
