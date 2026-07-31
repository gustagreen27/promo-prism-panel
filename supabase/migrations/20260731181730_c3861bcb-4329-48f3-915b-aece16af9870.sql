UPDATE public.whatsapp_connections
SET status = 'ativa',
    code_verification_status = 'VERIFIED',
    verified_name = 'Pimenta Estetica',
    updated_at = now()
WHERE phone_number_id = '1315987074922605';