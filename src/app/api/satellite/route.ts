import { NextRequest, NextResponse } from 'next/server'

// Hardcoded coordinates for key company facilities
// Bounding boxes [west, south, east, north] in WGS84
const FACILITY_COORDS: Record<string, {
  facilities: Array<{
    name: string
    bbox: [number, number, number, number] // [west, south, east, north]
    type: string
    interpretation: string
  }>
  sector: string
}> = {
  NVDA: {
    sector: 'semiconductor',
    facilities: [
      {
        name: 'Nvidia HQ Campus — Santa Clara, CA',
        bbox: [-121.980, 37.368, -121.960, 37.378],
        type: 'headquarters',
        interpretation: 'Campus car park density proxies employee headcount and active development velocity'
      },
    ]
  },
  AAPL: {
    sector: 'consumer_tech',
    facilities: [
      {
        name: 'Apple Park — Cupertino, CA',
        bbox: [-122.017, 37.332, -121.999, 37.342],
        type: 'headquarters',
        interpretation: 'Campus occupancy at Apple Park proxies headcount and R&D activity'
      },
      {
        name: 'Apple Manufacturing Partner — Zhengzhou',
        bbox: [113.635, 34.705, 113.685, 34.745],
        type: 'manufacturing_proxy',
        interpretation: 'Regional industrial activity near Foxconn Zhengzhou — iPhone assembly proxy'
      }
    ]
  },
  TSLA: {
    sector: 'automotive',
    facilities: [
      {
        name: 'Gigafactory Texas — Austin, TX',
        bbox: [-97.630, 30.216, -97.600, 30.236],
        type: 'gigafactory',
        interpretation: 'Gigafactory roof solar activity and car park density directly proxy production rate'
      },
      {
        name: 'Fremont Factory — California',
        bbox: [-121.966, 37.490, -121.950, 37.500],
        type: 'factory',
        interpretation: 'Primary US vehicle production facility — activity = output'
      }
    ]
  },
  META: {
    sector: 'social_media',
    facilities: [
      {
        name: 'Meta Menlo Park Campus — CA',
        bbox: [-122.153, 37.478, -122.133, 37.488],
        type: 'headquarters',
        interpretation: 'Campus car park density proxies employee headcount at operational scale'
      }
    ]
  },
  JPM: {
    sector: 'financials',
    facilities: [
      {
        name: 'JPMorgan Park Avenue HQ — NYC',
        bbox: [-73.977, 40.752, -73.969, 40.758],
        type: 'headquarters',
        interpretation: 'Office building activity in financial district proxies deal and trading activity'
      }
    ]
  },
  AMZN: {
    sector: 'ecommerce',
    facilities: [
      {
        name: 'Amazon HQ2 — Arlington, VA',
        bbox: [-77.052, 38.895, -77.038, 38.905],
        type: 'headquarters',
        interpretation: 'HQ2 campus activity proxies corporate hiring and operational velocity'
      },
      {
        name: 'Amazon Fulfillment Hub — JFK8 Staten Island',
        bbox: [-74.164, 40.583, -74.144, 40.597],
        type: 'fulfillment_center',
        interpretation: 'Fulfilment centre car park and loading dock activity directly proxies shipping volumes'
      }
    ]
  }
}

async function getSentinelHubToken(): Promise<string | null> {
  const clientId = process.env.SENTINEL_HUB_CLIENT_ID
  const clientSecret = process.env.SENTINEL_HUB_CLIENT_SECRET

  if (!clientId || !clientSecret) return null

  try {
    const res = await fetch(
      'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
        }),
      }
    )
    const data = await res.json()
    return data.access_token || null
  } catch {
    return null
  }
}

async function getFacilityActivity(
  bbox: [number, number, number, number],
  token: string,
  facilityName: string
) {
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)

  const toISO = (d: Date) => d.toISOString().split('T')[0]

  // Sentinel-2 Statistical API
  // NDVI change between periods tells us vegetation/surface change
  // For car parks: low NDVI + high NDBI (built-up index) with change detection
  // We use a simple approach: mean B04 (red) reflectance as a proxy
  // Higher red reflectance from bare surfaces vs vegetation indicates more car park activity
  const evalscript = `
//VERSION=3
function setup() {
  return {
    input: [{
      bands: ["B04", "B08", "B11", "SCL"],
      units: "REFLECTANCE"
    }],
    output: [
      { id: "ndvi", bands: 1 },
      { id: "ndbi", bands: 1 }
    ],
    mosaicking: "ORBIT"
  };
}

function filterScenes(availableScenes) {
  return availableScenes.filter(scene => {
    return scene.snow === false;
  });
}

function evaluatePixel(samples) {
  // Filter cloudy pixels using Scene Classification Layer
  if (samples.SCL === 3 || samples.SCL === 8 || samples.SCL === 9 || samples.SCL === 10) {
    return { ndvi: [NaN], ndbi: [NaN] };
  }
  
  const ndvi = (samples.B08 - samples.B04) / (samples.B08 + samples.B04 + 0.0001);
  const ndbi = (samples.B11 - samples.B08) / (samples.B11 + samples.B08 + 0.0001);
  
  return {
    ndvi: [ndvi],
    ndbi: [ndbi]
  };
}
`

  const makeRequest = async (fromDate: string, toDate: string) => {
    const body = {
      input: {
        bounds: {
          properties: { crs: 'http://www.opengis.net/def/crs/OGC/1.3/CRS84' },
          bbox,
        },
        data: [{
          type: 'sentinel-2-l2a',
          dataFilter: {
            timeRange: { from: `${fromDate}T00:00:00Z`, to: `${toDate}T23:59:59Z` },
            maxCloudCoverage: 30,
          }
        }]
      },
      aggregation: {
        timeRange: { from: `${fromDate}T00:00:00Z`, to: `${toDate}T23:59:59Z` },
        aggregationInterval: { of: 'P30D' },
        evalscript,
        resx: 10,
        resy: 10,
      },
      calculations: {
        ndvi: { histograms: { default: { nBins: 20, lowEdge: -1.0, highEdge: 1.0 } }, statistics: { default: { percentiles: { k: [25, 50, 75] } } } },
        ndbi: { statistics: { default: { percentiles: { k: [25, 50, 75] } } } }
      }
    }

    const res = await fetch(
      'https://sh.dataspace.copernicus.eu/api/v1/statistics',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      }
    )

    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      console.error(`Sentinel Hub statistics API error for ${facilityName}: ${res.status} ${errBody.slice(0, 500)}`)
      return { __debugError: `${res.status}: ${errBody.slice(0, 300)}` }
    }
    return res.json()
  }

  const [recentData, priorData] = await Promise.all([
    makeRequest(toISO(thirtyDaysAgo), toISO(now)),
    makeRequest(toISO(sixtyDaysAgo), toISO(thirtyDaysAgo)),
  ])

  const recentErr = (recentData as { __debugError?: string })?.__debugError
  const priorErr = (priorData as { __debugError?: string })?.__debugError
  if (recentErr || priorErr) {
    return { __debugError: recentErr || priorErr } as never
  }

  if (!recentData || !priorData) return null

  const getStats = (data: Record<string, unknown>) => {
    const outputs = (data as { data?: Array<{ outputs?: { ndvi?: { statistics?: { default?: { mean?: number; sampleCount?: number } } }; ndbi?: { statistics?: { default?: { mean?: number } } } } }> }).data?.[0]?.outputs
    return {
      ndviMean: outputs?.ndvi?.statistics?.default?.mean ?? null,
      ndbiMean: outputs?.ndbi?.statistics?.default?.mean ?? null,
      sampleCount: outputs?.ndvi?.statistics?.default?.sampleCount ?? 0,
    }
  }

  const recent = getStats(recentData)
  const prior = getStats(priorData)

  if (recent.ndviMean === null || prior.ndviMean === null) {
    return {
      __debugError: `200 OK but no NDVI stats. recentData keys: ${JSON.stringify(Object.keys(recentData)).slice(0, 150)} recentData.data: ${JSON.stringify((recentData as { data?: unknown }).data).slice(0, 400)}`,
    } as never
  }

  // NDVI decrease + NDBI increase = more built-up surface activity (more vehicles, more use)
  const ndviChange = recent.ndviMean - prior.ndviMean
  const ndbiChange = recent.ndbiMean !== null && prior.ndbiMean !== null
    ? recent.ndbiMean - prior.ndbiMean
    : 0

  // Activity signal: negative NDVI change + positive NDBI change = more activity
  // (vegetation replaced by reflective surfaces like car roofs, active loading docks)
  const activityScore = (-ndviChange + ndbiChange) * 100

  const direction = activityScore > 2 ? 'elevated' : activityScore < -2 ? 'reduced' : 'stable'

  return {
    facility: facilityName,
    recentNDVI: parseFloat(recent.ndviMean.toFixed(4)),
    priorNDVI: parseFloat(prior.ndviMean.toFixed(4)),
    ndviChange: parseFloat(ndviChange.toFixed(4)),
    ndbiChange: parseFloat(ndbiChange.toFixed(4)),
    activityScore: parseFloat(activityScore.toFixed(2)),
    direction,
    interpretation: direction === 'elevated'
      ? `Surface activity elevated vs prior 30 days — consistent with increased vehicle presence`
      : direction === 'reduced'
      ? `Surface activity reduced vs prior 30 days — fewer vehicles detected at facility`
      : `Stable surface activity — no significant change detected`,
    sampleCount: recent.sampleCount,
    cloudFreeImages: recentData?.data?.length || 0,
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const symbol = searchParams.get('symbol')

  if (!symbol || !FACILITY_COORDS[symbol]) {
    return NextResponse.json({ error: 'Symbol not supported' }, { status: 400 })
  }

  const config = FACILITY_COORDS[symbol]
  const token = await getSentinelHubToken()

  if (!token) {
    return NextResponse.json({
      symbol,
      available: false,
      message: 'Add SENTINEL_HUB_CLIENT_ID and SENTINEL_HUB_CLIENT_SECRET to enable satellite imagery analysis',
      facilities: config.facilities.map(f => ({
        name: f.name,
        type: f.type,
        interpretation: f.interpretation,
        coordinates: f.bbox,
        dataAvailable: false,
      })),
      source: 'ESA Copernicus Sentinel-2 (free via Copernicus Data Space Ecosystem)',
      hedgeFundEquivalent: 'Planet Labs daily imagery ($500k+/year) or Maxar constellation',
      setupUrl: 'https://dataspace.copernicus.eu/',
    })
  }

  // Fetch satellite data for all facilities
  const facilityResults = await Promise.all(
    config.facilities.map(async (facility) => {
      const satelliteData = await getFacilityActivity(facility.bbox, token, facility.name)
      const debugError = (satelliteData as { __debugError?: string } | null)?.__debugError
      return {
        name: facility.name,
        type: facility.type,
        debugError,
        interpretation: facility.interpretation,
        coordinates: facility.bbox,
        satelliteData,
        dataAvailable: satelliteData !== null && !debugError,
      }
    })
  )

  // Aggregate signal
  const availableResults = facilityResults.filter(f => f.dataAvailable && f.satelliteData)

  // Honest availability: we had a valid token, but if Sentinel Hub
  // returned no usable data for any facility, report this as genuinely
  // unavailable rather than silently defaulting to a misleading 0.0 /
  // "stable" result that looks like real data but isn't.
  if (availableResults.length === 0) {
    return NextResponse.json({
      symbol,
      available: false,
      message: 'Sentinel Hub returned no usable imagery for this period — satellite signal temporarily unavailable',
      facilities: facilityResults,
      source: 'ESA Copernicus Sentinel-2 (free via Copernicus Data Space Ecosystem)',
      hedgeFundEquivalent: 'Planet Labs daily imagery ($500k+/year) or Maxar constellation',
    })
  }

  const avgActivityScore = availableResults.reduce((s, f) => s + (f.satelliteData?.activityScore || 0), 0) / availableResults.length

  const aggregateDirection = avgActivityScore > 2 ? 'elevated' : avgActivityScore < -2 ? 'reduced' : 'stable'
  const aggregateSignal = avgActivityScore > 2 ? 'bull' : avgActivityScore < -2 ? 'bear' : 'neut'

  return NextResponse.json({
    symbol,
    available: true,
    facilities: facilityResults,
    aggregateActivityScore: parseFloat(avgActivityScore.toFixed(2)),
    aggregateDirection,
    aggregateSignal,
    aggregateInterpretation: `${aggregateDirection === 'elevated' ? 'Elevated' : aggregateDirection === 'reduced' ? 'Reduced' : 'Stable'} activity across ${availableResults.length} location${availableResults.length !== 1 ? 's' : ''} (30d). ${aggregateDirection === 'elevated' ? 'Stronger momentum than analysts may capture.' : aggregateDirection === 'reduced' ? 'Weaker pace ahead of earnings.' : 'No significant change detected.'}`,
    dataSource: 'ESA Copernicus Sentinel-2 L2A — 10m resolution, 5-day revisit, free via CDSE',
    methodology: 'NDVI + NDBI change detection over facility bounding boxes. Reduced NDVI + increased NDBI indicates more vehicle/surface activity.',
    hedgeFundEquivalent: 'Planet Labs SkySat or Maxar WorldView — 30-50cm resolution, daily revisit, $500k+/year',
    processingPlatform: 'Sentinel Hub Statistical API (Copernicus Data Space Ecosystem)',
  })
}
