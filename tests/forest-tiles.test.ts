import { describe, expect, it } from 'vitest'

import { tileCanHoldZones } from '@/../scripts/ingest-forest-italia'

/**
 * Saltare una tessera sbagliata non da' un errore: toglie il bosco a qualche comune, in silenzio.
 * Questi controlli tengono il filtro dalla parte prudente.
 */
describe('tileCanHoldZones', () => {
  // Il Casentino cade attorno a y = 2.295.000 in EPSG:3035.
  const casentino = [{ y: 2_294_977 }]

  it('tiene la tessera che contiene la zona', () => {
    expect(tileCanHoldZones('spp_pred_ulx_4400_uly_2340.tif', casentino)).toBe(true)
  })

  it('tiene anche la tessera accanto, perche\' il cerchio puo\' scavallare', () => {
    expect(tileCanHoldZones('spp_pred_ulx_4400_uly_2240.tif', casentino)).toBe(true)
  })

  it('salta la Lapponia e il Nordafrica, che nessuna zona italiana tocca', () => {
    expect(tileCanHoldZones('spp_pred_ulx_4400_uly_5140.tif', casentino)).toBe(false)
    expect(tileCanHoldZones('spp_pred_ulx_4400_uly_1240.tif', casentino)).toBe(false)
  })

  it('nel dubbio estrae: un nome che non si sa leggere non fa saltare niente', () => {
    // Se un giorno la fonte cambiasse il nome delle tessere, la corsa tornerebbe lenta come
    // prima. Il contrario — saltare per un nome non riconosciuto — perderebbe dati zitto zitto.
    expect(tileCanHoldZones('tessera_senza_coordinate.tif', casentino)).toBe(true)
    expect(tileCanHoldZones('spp_pred_ulx_4400.tif', casentino)).toBe(true)
  })

  it('non salta niente quando nessuna zona e\' in gioco solo per colpa del margine', () => {
    // Una zona proprio sul bordo inferiore della tessera resta servita.
    expect(tileCanHoldZones('spp_pred_ulx_4400_uly_2340.tif', [{ y: 2_240_100 }])).toBe(true)
  })
})
