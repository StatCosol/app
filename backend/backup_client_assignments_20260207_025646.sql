--
-- PostgreSQL database dump
--

\restrict j3QtKuFyZnSmsMbq0p8boGaIqdkcVI9WCIdOSlPPzrFa8rSUfSudMFUZUrF4iCy

-- Dumped from database version 18.1
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: client_assignment_current; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.client_assignment_current (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    crm_user_id uuid,
    auditor_user_id uuid,
    status public.assignment_status_enum DEFAULT 'ACTIVE'::public.assignment_status_enum NOT NULL,
    start_date date,
    end_date date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.client_assignment_current OWNER TO postgres;

--
-- Name: client_assignments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.client_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    crm_user_id uuid,
    auditor_user_id uuid,
    status public.assignment_status_enum DEFAULT 'ACTIVE'::public.assignment_status_enum NOT NULL,
    start_date date,
    end_date date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.client_assignments OWNER TO postgres;

--
-- Data for Name: client_assignment_current; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.client_assignment_current (id, client_id, crm_user_id, auditor_user_id, status, start_date, end_date, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: client_assignments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.client_assignments (id, client_id, crm_user_id, auditor_user_id, status, start_date, end_date, created_at, updated_at) FROM stdin;
\.


--
-- Name: client_assignment_current client_assignment_current_client_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.client_assignment_current
    ADD CONSTRAINT client_assignment_current_client_id_key UNIQUE (client_id);


--
-- Name: client_assignment_current client_assignment_current_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.client_assignment_current
    ADD CONSTRAINT client_assignment_current_pkey PRIMARY KEY (id);


--
-- Name: client_assignments client_assignments_client_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.client_assignments
    ADD CONSTRAINT client_assignments_client_id_key UNIQUE (client_id);


--
-- Name: client_assignments client_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.client_assignments
    ADD CONSTRAINT client_assignments_pkey PRIMARY KEY (id);


--
-- Name: idx_client_assignment_current_auditor; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_client_assignment_current_auditor ON public.client_assignment_current USING btree (auditor_user_id);


--
-- Name: idx_client_assignment_current_crm; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_client_assignment_current_crm ON public.client_assignment_current USING btree (crm_user_id);


--
-- Name: idx_client_assignment_current_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_client_assignment_current_status ON public.client_assignment_current USING btree (status);


--
-- Name: idx_client_assignments_auditor; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_client_assignments_auditor ON public.client_assignments USING btree (auditor_user_id);


--
-- Name: idx_client_assignments_crm; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_client_assignments_crm ON public.client_assignments USING btree (crm_user_id);


--
-- Name: idx_client_assignments_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_client_assignments_status ON public.client_assignments USING btree (status);


--
-- Name: client_assignment_current client_assignment_current_auditor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.client_assignment_current
    ADD CONSTRAINT client_assignment_current_auditor_user_id_fkey FOREIGN KEY (auditor_user_id) REFERENCES public.users(id);


--
-- Name: client_assignment_current client_assignment_current_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.client_assignment_current
    ADD CONSTRAINT client_assignment_current_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: client_assignment_current client_assignment_current_crm_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.client_assignment_current
    ADD CONSTRAINT client_assignment_current_crm_user_id_fkey FOREIGN KEY (crm_user_id) REFERENCES public.users(id);


--
-- Name: client_assignments client_assignments_auditor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.client_assignments
    ADD CONSTRAINT client_assignments_auditor_user_id_fkey FOREIGN KEY (auditor_user_id) REFERENCES public.users(id);


--
-- Name: client_assignments client_assignments_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.client_assignments
    ADD CONSTRAINT client_assignments_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: client_assignments client_assignments_crm_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.client_assignments
    ADD CONSTRAINT client_assignments_crm_user_id_fkey FOREIGN KEY (crm_user_id) REFERENCES public.users(id);


--
-- PostgreSQL database dump complete
--

\unrestrict j3QtKuFyZnSmsMbq0p8boGaIqdkcVI9WCIdOSlPPzrFa8rSUfSudMFUZUrF4iCy

