from app.models import AIJob, ImageBatch, JobStatus, JobType, MLModel, Project, ProjectMember, ProjectRole, UserRole
from tests.conftest import ADMIN_PASSWORD, login, make_user


async def test_non_admin_cannot_list_users(client, db_session):
    user = await make_user(db_session, "plain@test.local", "PlainPass123")
    token = await login(client, user.email, "PlainPass123")

    r = await client.get("/api/users/", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403


async def test_admin_can_list_users(client, admin_user):
    token = await login(client, admin_user.email, ADMIN_PASSWORD)
    r = await client.get("/api/users/", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200


async def test_non_admin_cannot_change_roles(client, db_session):
    target = await make_user(db_session, "target@test.local", "TargetPass123")
    attacker = await make_user(db_session, "attacker@test.local", "AttackerPass123")
    token = await login(client, attacker.email, "AttackerPass123")

    r = await client.patch(
        f"/api/users/{target.id}",
        json={"role": "admin"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 403


async def test_non_member_cannot_access_project(client, db_session):
    owner = await make_user(db_session, "owner@test.local", "OwnerPass123")
    outsider = await make_user(db_session, "outsider@test.local", "OutsiderPass123")

    project = Project(name="Secret Project", created_by=owner.id)
    db_session.add(project)
    await db_session.flush()
    db_session.add(ProjectMember(project_id=project.id, user_id=owner.id, role=ProjectRole.OWNER))
    await db_session.commit()
    await db_session.refresh(project)

    token = await login(client, outsider.email, "OutsiderPass123")
    r = await client.get(f"/api/projects/{project.id}", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403


async def test_member_can_access_project(client, db_session):
    owner = await make_user(db_session, "owner2@test.local", "OwnerPass123")

    project = Project(name="Visible Project", created_by=owner.id)
    db_session.add(project)
    await db_session.flush()
    db_session.add(ProjectMember(project_id=project.id, user_id=owner.id, role=ProjectRole.OWNER))
    await db_session.commit()
    await db_session.refresh(project)

    token = await login(client, owner.email, "OwnerPass123")
    r = await client.get(f"/api/projects/{project.id}", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["name"] == "Visible Project"


async def test_non_owner_member_cannot_delete_project(client, db_session):
    owner = await make_user(db_session, "owner3@test.local", "OwnerPass123")
    annotator = await make_user(db_session, "annotator@test.local", "AnnotatorPass123")

    project = Project(name="Protected Project", created_by=owner.id)
    db_session.add(project)
    await db_session.flush()
    db_session.add(ProjectMember(project_id=project.id, user_id=owner.id, role=ProjectRole.OWNER))
    db_session.add(ProjectMember(project_id=project.id, user_id=annotator.id, role=ProjectRole.ANNOTATOR))
    await db_session.commit()
    await db_session.refresh(project)

    token = await login(client, annotator.email, "AnnotatorPass123")
    r = await client.delete(f"/api/projects/{project.id}", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403


async def test_cannot_read_ai_job_from_a_different_project(client, db_session):
    """
    Regression test for a real IDOR: get_job_status only checked that the
    caller was a member of the project_id in the URL, never that job_id
    actually belonged to that project — so a member of project B could read
    project A's job status/results (including image filenames) just by
    guessing job IDs.
    """
    owner_a = await make_user(db_session, "owner_a@test.local", "OwnerPass123")
    project_a = Project(name="Project A", created_by=owner_a.id)
    db_session.add(project_a)
    await db_session.flush()
    db_session.add(ProjectMember(project_id=project_a.id, user_id=owner_a.id, role=ProjectRole.OWNER))
    batch_a = ImageBatch(project_id=project_a.id, name="batch A")
    db_session.add(batch_a)
    await db_session.flush()
    model_a = MLModel(project_id=project_a.id, name="model A", model_path="/tmp/a.pt", uploaded_by=owner_a.id)
    db_session.add(model_a)
    await db_session.flush()
    job_a = AIJob(model_id=model_a.id, batch_id=batch_a.id, job_type=JobType.INFERENCE,
                  status=JobStatus.DONE, created_by=owner_a.id,
                  result_summary={"note": "secret project A data"})
    db_session.add(job_a)
    await db_session.commit()
    await db_session.refresh(job_a)

    outsider = await make_user(db_session, "outsider_b@test.local", "OutsiderPass123")
    project_b = Project(name="Project B", created_by=outsider.id)
    db_session.add(project_b)
    await db_session.flush()
    db_session.add(ProjectMember(project_id=project_b.id, user_id=outsider.id, role=ProjectRole.OWNER))
    await db_session.commit()
    await db_session.refresh(project_b)

    token = await login(client, outsider.email, "OutsiderPass123")
    # Attempt: read project A's job through project B's URL — outsider is
    # legitimately a member of project B, just not project A.
    r = await client.get(f"/api/projects/{project_b.id}/jobs/{job_a.id}",
                          headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 404

    # Sanity check: the same job IS reachable through the correct project.
    owner_token = await login(client, owner_a.email, "OwnerPass123")
    r2 = await client.get(f"/api/projects/{project_a.id}/jobs/{job_a.id}",
                           headers={"Authorization": f"Bearer {owner_token}"})
    assert r2.status_code == 200
