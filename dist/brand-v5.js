(function(){
 'use strict';
 const config=window.AURORA_SITE_CONFIG,contact=config.contact;
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const phone=contact.phone.replace(/[^+\d]/g,'');
 function card(compact=false){const el=document.createElement('section');el.className='contact-card'+(compact?' contact-card-compact':'');el.innerHTML=`<div class="contact-avatar" aria-hidden="true"><img src="${esc(config.brand.emblem)}" alt=""></div><div class="contact-details"><small>YOUR AURORA CONTACT</small><h3>联系${esc(contact.name)}</h3><p>配件选型 · 定制方向盘 · 品牌合作</p><a href="tel:${phone}" aria-label="致电${esc(contact.name)} ${phone}">${esc(contact.phone)} <span aria-hidden="true">↗</span></a></div>`;return el}
 function route(){const brand=document.querySelector('.site-header .brand-mark');if(brand){const mask='url('+JSON.stringify(config.brand.wordmark)+')';brand.style.maskImage=mask;brand.style.webkitMaskImage=mask}const footerLogo=document.querySelector('.footer-team-brand img');if(footerLogo)footerLogo.src=config.brand.emblem;const favicon=document.querySelector('link[rel="icon"]');if(favicon)favicon.href=config.brand.emblem;const signature=document.querySelector('.hero-signature');if(signature&&!signature.querySelector('.team-signature-mark')){const img=document.createElement('img');img.src=config.brand.emblem;img.alt='极光车队赛车图形 Logo';img.className='team-signature-mark';signature.prepend(img)}
 const service=document.querySelector('.service-layout>aside');if(service&&!service.querySelector('.contact-card'))service.prepend(card());
 const band=document.querySelector('.collaboration-band');if(band&&!band.querySelector('.collaboration-contact')){const link=document.createElement('a');link.className='collaboration-contact';link.href='tel:'+phone;link.innerHTML=`<small>直接联系 / DIRECT CONTACT</small><strong>${esc(contact.name)} <span>${esc(contact.phone)}</span></strong>`;band.querySelector('div').append(link)}
 const footer=document.querySelector('.footer-contact');if(footer){footer.querySelector('strong').textContent=contact.name;const a=footer.querySelector('a');a.href='tel:'+phone;a.innerHTML=esc(contact.phone)+' <span aria-hidden="true">↗</span>'}}
 new MutationObserver(()=>{const form=document.querySelector('#partner-form');if(form&&!form.parentElement.querySelector('.contact-card'))form.before(card(true))}).observe(document.querySelector('#modal-content'),{childList:true});
 window.addEventListener('aurora-page-rendered',route);route();
})();
