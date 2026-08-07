const { useEffect, useRef, useState } = React;

const ATLAS = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json';
const STATES = 'https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/states-10m.json';
let cache = null;

function waitForLibs() {
  return new Promise((res) => {
    const t = setInterval(() => {
      if (window.d3 && window.topojson) { clearInterval(t); res(); }
    }, 60);
  });
}

function MapView({ events = [], onSelect, selectedId, colorFor, paper, ink, rule }) {
  const ref = useRef(null);
  const [ready, setReady] = useState(false);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    let dead = false;
    (async () => {
      await waitForLibs();
      if (!cache) {
        let states = null, borders = null, outline = null;
        try {
          const us = await (await fetch(STATES)).json();
          states = window.topojson.feature(us, us.objects.states);
          borders = window.topojson.mesh(us, us.objects.states, (a, b) => a !== b);
          outline = window.topojson.mesh(us, us.objects.states, (a, b) => a === b);
        } catch (err) { /* fall back to country outline */ }
        if (!states) {
          const topo = await (await fetch(ATLAS)).json();
          const fc = window.topojson.feature(topo, topo.objects.countries);
          const usa = fc.features.find((f) => f.properties && f.properties.name === 'United States of America');
          states = { type: 'FeatureCollection', features: [usa] };
          outline = usa;
        }
        cache = { states, borders, outline };
      }
      if (!dead) setReady(true);
    })();
    return () => { dead = true; };
  }, []);

  useEffect(() => {
    if (!ready || !ref.current || !cache) return;
    const d3 = window.d3;
    const W = 1000, H = 600;
    const svg = d3.select(ref.current);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${W} ${H}`);

    const projection = d3.geoAlbersUsa().fitExtent([[24, 24], [W - 24, H - 24]], cache.states);
    const path = d3.geoPath(projection);

    svg.append('g').selectAll('path').data(cache.states.features).join('path')
      .attr('d', path).attr('fill', '#ffffff').attr('stroke', 'none');

    if (cache.borders) {
      svg.append('path').datum(cache.borders)
        .attr('d', path).attr('fill', 'none').attr('stroke', '#B9B09C')
        .attr('stroke-width', 1).attr('stroke-linejoin', 'round');
    }

    svg.append('path').datum(cache.outline)
      .attr('d', path).attr('fill', 'none').attr('stroke', ink)
      .attr('stroke-width', 2).attr('stroke-linejoin', 'round');

    const g = svg.append('g');
    events.forEach((e) => {
      const p = projection([e.lon, e.lat]);
      if (!p) return;
      const on = selectedId === e.id;
      const node = g.append('g')
        .attr('transform', `translate(${p[0]},${p[1]})`)
        .style('cursor', 'pointer')
        .on('mouseenter', () => setHover({ e, x: p[0] / W, y: p[1] / H }))
        .on('mouseleave', () => setHover(null))
        .on('click', () => onSelect && onSelect(e.id));
      node.append('circle').attr('r', on ? 15 : 10).attr('fill', colorFor(e.type))
        .attr('stroke', ink).attr('stroke-width', 2);
      if (on) node.append('circle').attr('r', 22).attr('fill', 'none')
        .attr('stroke', ink).attr('stroke-width', 2).attr('stroke-dasharray', '4 4');
    });
  }, [ready, events, selectedId]);

  return (
    <div style={{ position: 'relative', width: '100%', background: paper, border: `2px solid ${ink}` }}>
      <svg ref={ref} style={{ width: '100%', display: 'block' }} />
      {!ready && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
          font: '600 12px/1 "Space Mono", monospace', letterSpacing: '.12em', color: rule }}>
          LOADING GEOMETRY…
        </div>
      )}
      {hover && (
        <div style={{
          position: 'absolute', left: `${hover.x * 100}%`, top: `${hover.y * 100}%`,
          transform: 'translate(-50%, -140%)', pointerEvents: 'none', zIndex: 5,
          background: ink, color: paper, padding: '8px 10px', minWidth: 170,
          font: '400 11px/1.4 "Space Mono", monospace',
        }}>
          <div style={{ font: '700 13px/1.1 Archivo, sans-serif', letterSpacing: '.01em', marginBottom: 4 }}>{hover.e.name}</div>
          {hover.e.city}, {hover.e.state} · {hover.e.dist[hover.e.dist.length - 1]} mi
        </div>
      )}
    </div>
  );
}

module.exports = { MapView };
