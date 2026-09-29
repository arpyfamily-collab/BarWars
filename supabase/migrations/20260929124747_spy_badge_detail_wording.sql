-- "1 reports filed" -> "1 report filed"
do $$
begin
  execute replace(pg_get_functiondef('public.file_spy_intel(uuid, uuid, uuid, text, text, boolean)'::regprocedure),
                  'format(''%s reports filed'', total)',
                  'format(''%s report%s filed'', total, case when total = 1 then '''' else ''s'' end)');
end $$;
