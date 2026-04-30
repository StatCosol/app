-- Fix: Upload window close day from 25 to 27
-- Business rule: compliance upload window is 20th-27th of the following month

UPDATE sla_compliance_rules
SET    window_close_day = 27,
       updated_at = NOW()
WHERE  window_close_day = 25;
