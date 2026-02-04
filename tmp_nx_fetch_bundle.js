const pageUrl="https://www.nutritionix.com/potbelly/               
  menu/"+"premium?desktop";fetch(pageUrl).then(r=>r.text()).then(async      
  t=>{const scripts=(t.match(/<script[^>]+src="([^"]+)"/gi)||               
  []).map(s=>s.match(/src="([^"]+)"/i)?.                                    
  [1]).filter(Boolean);console.log("scripts:",scripts);const                
  main=scripts.find(s=>/nix_.*\.js/.test(s));if(!main){console.log("no      
  bundle found");return;}const js=await fetch(main).then(r=>r.text());const 
  hits=js.match(/https?:\/\/[^"'\\s]+/g)||[];const filtered=[...new        
  Set(hits.filter(u=>/api|nutritionix|nix/                                  
  i.test(u)))];console.log("endpoints:",filtered);}).catch(err=>console.erro
  r(err));
