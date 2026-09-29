# Release 0.36

Live release van de gedeelde-gegevensfunctionaliteit uit test 0.35.1-test.6.

- Gedeelde kaarten, locaties, thema's en acties kunnen via dezelfde update-engine worden gecontroleerd en bijgewerkt.
- Het hoofobject behoudt bij import dezelfde publieke identifier als de bron, zodat updates aan hetzelfde object herkenbaar blijven.
- Updatebeleid is algemeen instelbaar: automatisch controleren, handmatig controleren of niet controleren. Wijzigingen worden nooit zonder keuze toegepast.
- Voor het bijwerken toont Log de inhoudelijke verschillen tussen Mijn versie en Bronversie. QR-code en technische identifier worden bij deze vergelijking niet prominent getoond.
- Ontvangen gegevens behouden herkomstinformatie. De oorspronkelijke bronidentifier wordt niet automatisch publiceerbaar voor ontvangers; verder delen gebruikt een afgeleide publicatie met eigen identifier.
- Bestaande live opslag voor ritten, tijd/taken, locaties en deelinstellingen blijft behouden via de productie-compatibiliteitslaag.
