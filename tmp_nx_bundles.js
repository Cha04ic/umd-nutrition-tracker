  const url = "https://www.nutritionix.com/potbelly/menu/premium?desktop";  
  fetch(url)                                                                
    .then(r => r.text())                                                    
    .then(t => {                                                            
      const scripts = (t.match(/<script[^>]+src="([^"]+)"/gi) || [])        
        .map(s => s.match(/src="([^"]+)"/i)?.[1])                           
        .filter(Boolean);                                                   
      console.log(scripts);                                                 
    })                                                                      
    .catch(err => console.error(err));
