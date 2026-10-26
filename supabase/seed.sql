-- =============================================================================
-- 1 TAP SOLUTION — demonstration data
--   Every demo business is flagged is_demo = true and labelled "(Demo)".
--   Phone numbers are non-working placeholders; emails use example.com.
--   No scan events are seeded: dashboards only show real scans.
--   Document QRs (menu, brochure) need real PDF files in Storage, so they are
--   created by `npm run seed:files` (scripts/seed-demo-files.mjs).
-- Safe to re-run: existing rows with the same slug / public_code are skipped.
-- =============================================================================

insert into public.categories (name, slug, description) values
  ('Restaurants & Cafés',   'restaurants-cafes',     'Menus, tables, specials and reservations'),
  ('Hotels & Stays',        'hotels-stays',          'Hotels, guest houses and homestays'),
  ('Education',             'education',             'Schools, colleges, academies and coaching'),
  ('Retail',                'retail',                'Shops, boutiques and showrooms'),
  ('Professional Services', 'professional-services', 'Consultants, agencies and individual professionals'),
  ('Healthcare',            'healthcare',            'Clinics, pharmacies and practitioners'),
  ('Real Estate',           'real-estate',           'Listings, projects and agents'),
  ('Events',                'events',                'Event organisers and venues'),
  ('Salons & Wellness',     'salons-wellness',       'Salons, spas and service providers'),
  ('Manufacturing',         'manufacturing',         'Product packaging and manufacturer information')
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Businesses
-- ---------------------------------------------------------------------------
insert into public.businesses
  (slug, name, category_id, tagline, description, phone, whatsapp, email, website_url,
   accent_color, hours_note, custom_fields, is_demo)
values
  ('demo-chinar-leaf-cafe', 'Chinar Leaf Café (Demo)',
   (select id from public.categories where slug = 'restaurants-cafes'),
   'Slow coffee, fresh bakes and warm kahwa',
   'This is a demonstration business page. A neighbourhood café serving specialty coffee, kahwa, fresh bakes and all-day breakfast. Scan the table QR to see today''s menu.',
   '+91 00000 00001', '+910000000001', 'hello@example.com', 'https://example.com',
   '#B45309', 'Kitchen closes 30 minutes before closing time.',
   '[{"label":"Wi-Fi","value":"Ask at the counter"},{"label":"Seating","value":"Indoor and garden"}]', true),

  ('demo-lakeview-residency', 'Lakeview Residency (Demo)',
   (select id from public.categories where slug = 'hotels-stays'),
   'A quiet stay by the water',
   'This is a demonstration business page. A 24-room boutique hotel with lake-facing rooms, an in-house restaurant and airport pickup on request.',
   '+91 00000 00002', '+910000000002', 'stay@example.com', 'https://example.com',
   '#0E7490', 'Check-in 12:00, check-out 11:00. Reception is open 24 hours.', '[]', true),

  ('demo-northstar-academy', 'Northstar Academy (Demo)',
   (select id from public.categories where slug = 'education'),
   'Admissions open for the new session',
   'This is a demonstration business page. A senior secondary school offering science, commerce and humanities streams, with transport and hostel facilities.',
   '+91 00000 00003', null, 'admissions@example.com', 'https://example.com',
   '#4338CA', 'Admissions office closed on public holidays.', '[]', true),

  ('demo-loom-and-thread', 'Loom & Thread (Demo)',
   (select id from public.categories where slug = 'retail'),
   'Handwoven shawls and home textiles',
   'This is a demonstration business page. A small studio store selling handwoven shawls, stoles and home textiles, with worldwide shipping.',
   '+91 00000 00004', '+910000000004', 'shop@example.com', 'https://example.com',
   '#BE185D', null, '[]', true),

  ('demo-aisha-rahman-architect', 'Aisha Rahman, Architect (Demo)',
   (select id from public.categories where slug = 'professional-services'),
   'Residential and hospitality architecture',
   'This is a demonstration business page for an individual professional.',
   '+91 00000 00005', '+910000000005', 'studio@example.com', 'https://example.com',
   '#0F766E', null, '[]', true)
on conflict (slug) do nothing;

-- Locations (coordinates are generic city-centre points for demonstration)
insert into public.business_locations (business_id, label, address, latitude, longitude, position)
select b.id, v.label, v.address, v.lat, v.lng, v.pos
from (values
  ('demo-chinar-leaf-cafe',   'Main café',     '12 Example Street, Demo City', 28.6315, 77.2167, 0),
  ('demo-lakeview-residency', 'Hotel',         '1 Lakeshore Road, Demo City',  28.6129, 77.2295, 0),
  ('demo-northstar-academy',  'Main campus',   '45 College Road, Demo City',   28.6448, 77.2167, 0),
  ('demo-northstar-academy',  'Junior wing',   '9 Garden Lane, Demo City',     28.6400, 77.2100, 1),
  ('demo-loom-and-thread',    'Studio store',  '7 Market Lane, Demo City',     28.6505, 77.2303, 0)
) as v(slug, label, address, lat, lng, pos)
join public.businesses b on b.slug = v.slug
where not exists (select 1 from public.business_locations l where l.business_id = b.id and l.label = v.label);

-- Opening hours (0 = Monday)
insert into public.business_hours (business_id, day_of_week, opens_at, closes_at)
select b.id, d, o::time, c::time
from public.businesses b
cross join lateral (values
  (0, '08:00', '22:00'), (1, '08:00', '22:00'), (2, '08:00', '22:00'), (3, '08:00', '22:00'),
  (4, '08:00', '23:00'), (5, '09:00', '23:00'), (6, '09:00', '21:00')) as h(d, o, c)
where b.slug = 'demo-chinar-leaf-cafe'
  and not exists (select 1 from public.business_hours x where x.business_id = b.id);

insert into public.business_hours (business_id, day_of_week, opens_at, closes_at)
select b.id, d, '09:00'::time, '16:00'::time
from public.businesses b cross join generate_series(0, 5) as d
where b.slug = 'demo-northstar-academy'
  and not exists (select 1 from public.business_hours x where x.business_id = b.id);

insert into public.business_hours (business_id, day_of_week, opens_at, closes_at)
select b.id, d, '10:30'::time, '19:30'::time
from public.businesses b cross join generate_series(0, 6) as d
where b.slug = 'demo-loom-and-thread'
  and not exists (select 1 from public.business_hours x where x.business_id = b.id);

-- Social links (platform home pages only — no invented accounts)
insert into public.business_social_links (business_id, platform, url, position)
select b.id, v.platform, v.url, v.pos
from (values
  ('demo-chinar-leaf-cafe',  'instagram', 'https://www.instagram.com/', 0),
  ('demo-chinar-leaf-cafe',  'google_business', 'https://www.google.com/business/', 1),
  ('demo-lakeview-residency','facebook',  'https://www.facebook.com/', 0),
  ('demo-northstar-academy', 'youtube',   'https://www.youtube.com/', 0),
  ('demo-northstar-academy', 'facebook',  'https://www.facebook.com/', 1),
  ('demo-loom-and-thread',   'instagram', 'https://www.instagram.com/', 0),
  ('demo-loom-and-thread',   'pinterest', 'https://www.pinterest.com/', 1),
  ('demo-loom-and-thread',   'youtube',   'https://www.youtube.com/', 2),
  ('demo-aisha-rahman-architect', 'linkedin', 'https://www.linkedin.com/', 0)
) as v(slug, platform, url, pos)
join public.businesses b on b.slug = v.slug
where not exists (select 1 from public.business_social_links s where s.business_id = b.id and s.platform = v.platform);

-- Profile content blocks
insert into public.content_blocks (business_id, position, type, data)
select b.id, v.pos, v.type, v.data::jsonb
from (values
  ('demo-chinar-leaf-cafe', 0, 'heading', '{"text":"Today''s specials"}'),
  ('demo-chinar-leaf-cafe', 1, 'text', '{"text":"Saffron kahwa pot for two, walnut brownie, and a seasonal fruit tart. Ask our team about vegan options."}'),
  ('demo-lakeview-residency', 0, 'heading', '{"text":"Guest services"}'),
  ('demo-lakeview-residency', 1, 'text', '{"text":"Airport pickup, laundry, guided lake tours and a 24-hour front desk. Message us on WhatsApp for anything you need during your stay."}')
) as v(slug, pos, type, data)
join public.businesses b on b.slug = v.slug
where not exists (select 1 from public.content_blocks c where c.business_id = b.id and c.qr_code_id is null);

-- ---------------------------------------------------------------------------
-- QR codes (fixed demo codes so marketing material can reference them)
-- ---------------------------------------------------------------------------
insert into public.qr_codes (public_code, business_id, name, description, type, destination, design, is_demo)
select v.code, b.id, v.name, v.description, v.type, v.destination::jsonb, v.design::jsonb, true
from (values
  ('demoCafe01', 'demo-chinar-leaf-cafe', 'Chinar Leaf Café — Table QR', 'Placed on every table. Opens the café profile.',
   'business_profile', '{}', '{"fg":"#1C1917","bg":"#FFFFFF","dots":"rounded","eyes":"rounded","frame":true,"cta":"Scan for menu","ecl":"Q"}'),
  ('demoHotel01', 'demo-lakeview-residency', 'Lakeview Residency — Reception', 'Reception desk standee.',
   'business_profile', '{}', '{"fg":"#0B1020","bg":"#FFFFFF","dots":"square","eyes":"square","frame":true,"cta":"Scan to explore","ecl":"M"}'),
  ('demoHotelMap', 'demo-lakeview-residency', 'Lakeview Residency — Directions', 'Printed on booking confirmations.',
   'maps', '{"latitude":28.6129,"longitude":77.2295,"label":"Lakeview Residency (Demo)"}', '{"ecl":"M"}'),
  ('demoHotelWA', 'demo-lakeview-residency', 'Lakeview Residency — WhatsApp concierge', 'In-room card.',
   'whatsapp', '{"phone":"+910000000002","message":"Hello, I am a guest and need help with…"}', '{"ecl":"M"}'),
  ('demoAcademy1', 'demo-northstar-academy', 'Northstar Academy — Admissions', 'Admissions banner at the gate.',
   'business_profile', '{}', '{"fg":"#312E81","bg":"#FFFFFF","dots":"rounded","eyes":"rounded","ecl":"Q"}'),
  ('demoStore01', 'demo-loom-and-thread', 'Loom & Thread — New collection', 'Shop window poster. Custom landing page.',
   'landing_page', '{"title":"The Winter Collection"}', '{"fg":"#831843","bg":"#FFFFFF","dots":"rounded","eyes":"rounded","frame":true,"cta":"Shop the look","ecl":"Q"}'),
  ('demoStoreIG', 'demo-loom-and-thread', 'Loom & Thread — Instagram', 'Shopping-bag tag.',
   'social', '{"platform":"instagram","url":"https://www.instagram.com/"}', '{"ecl":"M"}'),
  ('demoCard01', 'demo-aisha-rahman-architect', 'Aisha Rahman — Business card', 'Back of printed visiting card.',
   'contact_card', '{"full_name":"Aisha Rahman","title":"Principal Architect","organization":"Studio Rahman (Demo)","phone":"+91 00000 00005","email":"studio@example.com","website":"https://example.com","address":"Demo City","note":"Demonstration contact card"}',
   '{"fg":"#134E4A","bg":"#FFFFFF","dots":"square","eyes":"rounded","ecl":"M"}')
) as v(code, slug, name, description, type, destination, design)
join public.businesses b on b.slug = v.slug
on conflict (public_code) do nothing;

-- Landing page blocks for the store QR
insert into public.content_blocks (business_id, qr_code_id, position, type, data)
select q.business_id, q.id, v.pos, v.type, v.data::jsonb
from (values
  (0, 'heading', '{"text":"The Winter Collection"}'),
  (1, 'text', '{"text":"Twelve new handwoven pieces in undyed wool and natural madder red. Every shawl is woven on a traditional handloom and takes up to three weeks to finish."}'),
  (2, 'button', '{"label":"Browse the collection","url":"https://example.com"}'),
  (3, 'whatsapp', '{"phone":"+910000000004","message":"Hi! I saw the Winter Collection poster.","label":"Ask about a piece"}'),
  (4, 'social', '{"platform":"instagram","url":"https://www.instagram.com/","label":"Follow on Instagram"}')
) as v(pos, type, data)
cross join public.qr_codes q
where q.public_code = 'demoStore01'
  and not exists (select 1 from public.content_blocks c where c.qr_code_id = q.id);
