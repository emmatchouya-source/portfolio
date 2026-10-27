// Suggestions rendered in the page, including in browsers without datalist UI.
export function createBoardPicker({input,list,boards,label,getGroup,onInput,onSelect,onResults}){
  const clean=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  let matches=[],active=-1,selecting=false;
  function close(){list.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');active=-1;}
  function highlight(index){
    active=index;
    [...list.children].forEach((el,i)=>el.setAttribute('aria-selected',i===active?'true':'false'));
    if(active>=0){input.setAttribute('aria-activedescendant',list.children[active].id);list.children[active].scrollIntoView({block:'nearest'});}
    else input.removeAttribute('aria-activedescendant');
  }
  function select(board){
    selecting=true;input.value=label(board);onSelect(board);close();input.focus({preventScroll:true});selecting=false;
  }
  function refresh(open=false,all=false){
    const query=all?'':clean(input.value),group=getGroup();
    matches=boards.filter(b=>(!group||b.group===group)&&clean(`${label(b)} ${b.group} ${b.architecture} ${b.core}`).includes(query));
    active=-1;input.removeAttribute('aria-activedescendant');list.replaceChildren();
    matches.forEach((board,index)=>{
      const item=document.createElement('li');item.id=`board-suggestion-${index}`;item.setAttribute('role','option');item.setAttribute('aria-selected','false');item.dataset.boardId=board.id;
      const name=document.createElement('span'),detail=document.createElement('small');name.textContent=label(board);detail.textContent=board.group;item.append(name,detail);
      item.addEventListener('mousedown',e=>e.preventDefault());item.addEventListener('click',()=>select(board));list.append(item);
    });
    if(!matches.length){const item=document.createElement('li');item.className='board-no-results';item.textContent='Aucune carte trouvée.';item.setAttribute('role','presentation');list.append(item);}
    list.hidden=!open||input.disabled;input.setAttribute('aria-expanded',list.hidden?'false':'true');onResults(matches.length);
  }
  input.addEventListener('input',()=>{onInput();refresh(true);});
  input.addEventListener('focus',()=>{if(!selecting)refresh(true,boards.some(b=>label(b)===input.value));});
  input.addEventListener('click',()=>{if(list.hidden)refresh(true,boards.some(b=>label(b)===input.value));});
  input.addEventListener('keydown',e=>{
    if(e.key==='Escape'){close();e.preventDefault();return;}
    if(e.key==='Tab'){close();return;}
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){
      e.preventDefault();if(list.hidden)refresh(true,boards.some(b=>label(b)===input.value));
      if(matches.length)highlight((active+(e.key==='ArrowDown'?1:active<0?0:-1)+matches.length)%matches.length);return;
    }
    if(e.key==='Enter'&&!list.hidden&&matches.length){e.preventDefault();select(matches[active>=0?active:0]);}
  });
  const outside=e=>{if(!input.closest('.board-picker').contains(e.target))close();};
  document.addEventListener('pointerdown',outside);document.addEventListener('focusin',outside);
  return {refresh,close};
}
