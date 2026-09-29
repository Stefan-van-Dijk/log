# Log — model voor gedeelde gegevens

## Kernregel

Een gedeelde identifier beschrijft de identiteit van één gepubliceerde bron. **Delen** en **samenwerken** zijn twee aparte eigenschappen van diezelfde identifier.

- Een gedeelde identifier kan door anderen worden opgehaald.
- De deler bepaalt per identifier of **Samenwerken aan** aan of uit staat.
- Als samenwerken aan staat, mag iedereen die de identifier kent wijzigingen onder diezelfde identifier publiceren.
- Als samenwerken uit staat, kan de identifier wel worden gelezen maar alleen de deler kan publiceren.

Er is voor de gebruiker geen aparte samenwerkingscode of lokaal schrijfrecht.

## Rollen

### Deler
- Publiceert een object voor het eerst.
- Behoudt dezelfde identifier bij nieuwe revisies.
- Kan **Samenwerken aan** aan- of uitzetten.
- Kan **Delen stoppen**.

### Ontvanger
- Slaat het hoofobject lokaal op met dezelfde identifier, zodat herkomst en updates herkenbaar blijven.
- Mag lokaal wijzigingen maken.
- Mag wijzigingen naar dezelfde identifier publiceren wanneer **Samenwerken aan** voor die identifier aan staat.
- Hoeft daarvoor geen aparte sleutel of samenwerkingscode te ontvangen.

## Zichtbare status per regel

Een gedeeld object toont linksboven de bestaande synchronisatiestatus:
- groen: gedeeld en actueel;
- oranje: bronupdate beschikbaar;
- pulserend grijs/groen: lokale wijzigingen nog publiceren;
- geen bolletje: niet gedeeld.

Bij een kaart waarop samenwerken aan staat wordt daarnaast een compact samenwerkingsicoon getoond. Zo is direct per regel zichtbaar dat iedereen met de identifier kan terugpubliceren.

## Updates

Controleren op updates wijzigt lokale gegevens nooit automatisch. Een gebruiker kiest zelf of een nieuwere bronversie wordt toegepast.

## Samenwerken aan

De server bewaart per identifier alleen de toestand `collaboration = true/false`. Er wordt geen geheime schrijfsleutel via de kaart of QR-code verspreid.

Bij `collaboration = true` accepteert de server een nieuwe revisie van een bestaande identifier van iedere Log-client die die identifier kent. De identifier functioneert daarmee bewust als samenwerkings-capability.

Alleen de deler, aangemeld met de publicatiesleutel, mag samenwerken aan- of uitzetten.

## Delen stoppen

**Delen stoppen** is een beheeractie van de deler:
- de actuele publieke JSON wordt verwijderd;
- de laatste revisie blijft in de versiehistorie bewaard;
- de identifier wordt server-side als gestopt geregistreerd;
- nieuwe ophalingen via die identifier geven geen gedeelde configuratie meer terug;
- nieuwe samenwerkingswrites op die identifier worden geweigerd;
- bestaande lokale kopieën op andere apparaten blijven lokaal bestaan.

Wanneer hetzelfde lokale object later opnieuw wordt gedeeld, krijgt het een nieuwe identifier.

## Servercontract testomgeving

De testclient gebruikt voor beheer:
- `X-Log-Publish-Key` voor acties van de deler;
- `X-Log-Collaboration: on|off` om samenwerken aan of uit te zetten;
- `X-Log-Stop-Sharing: 1` om delen te stoppen.

Een samenwerkingswrite bevat bewust geen aparte write-token. De server accepteert die write alleen wanneer de identifier al bestaat, niet gestopt is en server-side `collaboration = true` staat.

De bijbehorende referentie-implementatie staat in `test/server/publish.php`.