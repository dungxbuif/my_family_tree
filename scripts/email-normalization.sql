-- ECMAScript WhiteSpace and LineTerminator code points accepted by String.trim().
-- The migration installs this same expression as public.normalize_email(text).
SELECT $$lower(btrim(email, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'))$$ AS normalize_email_sql \gset
