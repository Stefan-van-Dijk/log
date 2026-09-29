# Log — model voor gedeelde gegevens

## Kernregel

Een gedeelde identifier beschrijft de identiteit van één gepubliceerde bron. **Delen**, **samenwerken** en **herstelrecht** zijn eigenschappen van diezelfde bron.

- Een actieve identifier kan door anderen worden opgehaald.
- De deler bepaalt of **Samenwerken aan** aan of uit staat.
- Als samenwerken aan staat, mag iedereen die de identifier kent wijzigingen onder dezelfde identifier publiceren.
- Als samenwerken uit staat, kan de identifier wel worden gelezen maar alleen de oorspronkelijke deler kan publiceren.
- Er is geen aparte samenwerkingscode of lokaal schrijfrecht in de gebruikersinterface.

Zonder accounts geldt in dit model: **iemand die de identifier bezit is een deelnemer aan die gedeelde bron**.

## Rollen

### Oorspronkelijke deler
- Publiceert het object voor het eerst.
- Behoudt de identifier zolang dezelfde bron wordt gebruikt.
- Kan samenwerken aan- of uitzetten.
- Bepaalt het herstelrecht voor het geval de bron offline wordt gezet.
- Kan de bron offline zetten.
- Kan de identifier definitief intrekken.

### Ontvanger / samenwerkingspartner
- Houdt altijd een eigen lokale kopie.
- Kan wijzigingen naar dezelfde identifier publiceren wanneer samenwerken aan staat.
- Kan een offline bron opnieuw beschikbaar maken wanneer het gekozen herstelrecht dat toestaat.
- Kan bij de variant **nieuwe identifier** zijn lokale kopie als nieuwe bron delen.

## Statussen van een identifier

### Actief
De publieke JSON staat online en kan worden opgehaald.

### Offline
De publieke JSON wordt verwijderd van internet. De identifier en de status blijven server-side gereserveerd. Lokale kopieën blijven bestaan.

### Definitief ingetrokken
De publieke JSON is verwijderd en de identifier is permanent geblokkeerd. Dezelfde identifier kan niet meer worden geactiveerd. Een nieuwe deling krijgt een nieuwe identifier.

## Samenwerken aan

Bij `collaboration = true` accepteert de server een nieuwe revisie van een actieve identifier van iedere Log-client die de identifier kent.

De identifier functioneert daarmee bewust als samenwerkings-capability. Er wordt geen geheime schrijfcode in de QR-code of publieke configuratie opgenomen.

Alleen de oorspronkelijke deler kan de instelling **Samenwerken aan** wijzigen.

## Offline zetten en herstelrecht

Wanneer de oorspronkelijke deler de bron **Offline zet**, verdwijnt de actuele publieke JSON. De server bewaart de identifier, revisiehistorie en het gekozen herstelrecht.

Er zijn drie herstelvarianten:

1. **Alleen ik · dezelfde identifier**
   - Alleen de oorspronkelijke deler kan de bron opnieuw online zetten.
   - Dezelfde identifier wordt opnieuw gebruikt.

2. **Iedereen met de identifier · dezelfde identifier**
   - Iedereen die de identifier bezit kan de bron opnieuw online zetten.
   - Dezelfde identifier wordt opnieuw gebruikt.
   - Als samenwerking vóór offline zetten aan stond, blijft die instelling bewaard en wordt deze bij heractivering weer actief.

3. **Iedereen mag opnieuw delen · nieuwe identifier**
   - De oude identifier blijft offline.
   - Iedere partij met een lokale kopie kan het object opnieuw delen.
   - De nieuwe deling krijgt een nieuwe identifier.
   - Hiermee kunnen partijen zelfstandig verder zonder de oude bron opnieuw te activeren.

De oorspronkelijke deler kan het herstelrecht ook wijzigen terwijl de bron offline staat.

## Definitief intrekken

**Definitief intrekken** is anders dan offline zetten:
- de publieke JSON wordt verwijderd;
- de laatste publieke revisie blijft in de historie bewaard;
- de identifier wordt permanent als ingetrokken geregistreerd;
- dezelfde identifier kan door niemand opnieuw worden geactiveerd;
- lokale kopieën blijven bestaan;
- een lokale kopie kan later wel als nieuwe bron met een nieuwe identifier worden gedeeld.

## Zichtbare status per regel

Een gedeeld object gebruikt linksboven de synchronisatiestatus:
- groen: gedeeld en actueel;
- oranje: bronupdate beschikbaar;
- pulserend grijs/groen: lokale wijzigingen nog publiceren;
- grijs: bron staat offline;
- geen gedeelde status: lokaal object zonder actieve deling.

Bij een actieve kaart waarop samenwerken aan staat wordt daarnaast een compact samenwerkingsicoon getoond.

## Updates

Controleren op updates wijzigt lokale gegevens nooit automatisch. Een gebruiker kiest zelf of een nieuwere bronversie wordt toegepast.

## Servercontract testomgeving

De testclient gebruikt:
- `GET /log/api/publish.php?id=<identifier>` om alleen de deelstatus van een identifier op te vragen;
- `X-Log-Publish-Key` voor beheeracties van de oorspronkelijke deler;
- `X-Log-Collaboration: on|off` voor samenwerken;
- `X-Log-Reactivation-Mode: owner|collaborators|new-id` voor het herstelrecht;
- `X-Log-Sharing-Action: offline` om de publieke bron tijdelijk te verwijderen;
- `X-Log-Sharing-Action: reactivate` om een toegestane offline bron opnieuw online te zetten;
- `X-Log-Sharing-Action: revoke` om de identifier definitief in te trekken;
- `X-Log-Sharing-Action: settings` om beheerinstellingen te wijzigen zonder een gewone inhoudspublicatie.

De server staat een heractivering zonder publicatiesleutel alleen toe wanneer de opgeslagen herstelmodus `collaborators` is. In dat geval is kennis van de identifier bewust het herstelrecht.

De referentie-implementatie staat in `test/server/publish.php`.