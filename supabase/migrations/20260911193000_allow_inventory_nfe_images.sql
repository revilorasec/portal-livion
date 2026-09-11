update storage.buckets
set allowed_mime_types=array[
  'application/xml',
  'text/xml',
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp'
]
where id='inventory-nfe';
