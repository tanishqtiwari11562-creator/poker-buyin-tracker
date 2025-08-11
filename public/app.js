const API = '/api';

async function api(path, opts={}){
  const res = await fetch(path, opts);
  if (!res.ok) {
    const text = await res.text().catch(()=>'');
    throw new Error('API error: ' + (text||res.status));
  }
  return res.json();
}

function el(tag, cls=''){ const e=document.createElement(tag); if(cls) e.className=cls; return e; }

async function refresh(){
  try {
    const players = await api(API + '/players');
    const totals = await api(API + '/totals');
    const playersList = document.getElementById('playersList');
    playersList.innerHTML='';

    players.forEach(p => {
      const card = el('div','player-card');
      const info = el('div','player-info');
      info.innerHTML = `<div class="player-name">${p.name}</div><div class="player-amount">₹ ${p.net_amount || 0}</div>`;

      const controls = el('div','controls');
      const chipInputs = el('div','chip-inputs');
      ['white','red','green','blue'].forEach(c=>{
        const inp = el('input'); inp.type='number'; inp.min=0; inp.placeholder=c; inp.dataset.color=c;
        chipInputs.appendChild(inp);
      });

      const rowbtns = el('div','rowbtns');

      const addBtn = el('button'); addBtn.className='small-btn'; addBtn.textContent='Add';
      addBtn.onclick = async ()=>{
        const vals = Array.from(chipInputs.querySelectorAll('input')).reduce((a,i)=>{ a[i.dataset.color]=parseInt(i.value||0); return a; },{});
        await api(API + '/transactions', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ player_id:p.id, ...vals, type:'buy-in' }) });
        refresh();
      }

      const retBtn = el('button'); retBtn.className='small-btn'; retBtn.textContent='Return';
      retBtn.onclick = async ()=>{
        const vals = Array.from(chipInputs.querySelectorAll('input')).reduce((a,i)=>{ a[i.dataset.color]=parseInt(i.value||0); return a; },{});
        await api(API + '/transactions', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ player_id:p.id, ...vals, type:'return' }) });
        refresh();
      }

      const toggleBtn = el('button'); toggleBtn.className='small-btn'; toggleBtn.textContent = p.is_active ? 'Deactivate' : 'Activate';
      toggleBtn.onclick = async ()=>{ await api(API + `/players/${p.id}/toggle`, { method:'POST' }); refresh(); }

      rowbtns.appendChild(addBtn); rowbtns.appendChild(retBtn); rowbtns.appendChild(toggleBtn);

      controls.appendChild(chipInputs);
      controls.appendChild(rowbtns);

      card.appendChild(info);
      card.appendChild(controls);

      playersList.appendChild(card);
    });

    document.getElementById('chipWhite').textContent = totals.chips.white || 0;
    document.getElementById('chipRed').textContent = totals.chips.red || 0;
    document.getElementById('chipGreen').textContent = totals.chips.green || 0;
    document.getElementById('chipBlue').textContent = totals.chips.blue || 0;
    document.getElementById('moneyInPlay').textContent = `₹${totals.money_in_play}`;
    document.getElementById('bankValue').textContent = `₹${totals.money_in_play}`;
  } catch (err) {
    console.error(err);
    alert('Error: ' + err.message);
  }
}

window.addEventListener('load', ()=>{
  document.getElementById('addPlayerBtn').addEventListener('click', async ()=>{
    const name = document.getElementById('playerName').value.trim();
    if(!name) return alert('Enter name');
    await api(API + '/players', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name }) });
    document.getElementById('playerName').value='';
    refresh();
  });

  document.getElementById('roundReset').addEventListener('click', async ()=>{
    if(!confirm('Round reset will clear transactions but keep players. Continue?')) return;
    await api(API + '/reset/round', { method:'POST' });
    refresh();
  });

  document.getElementById('fullReset').addEventListener('click', async ()=>{
    if(!confirm('Full reset will delete players and transactions. Continue?')) return;
    await api(API + '/reset/full', { method:'POST' });
    refresh();
  });

  refresh();
});
