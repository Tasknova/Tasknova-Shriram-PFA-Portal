# AI Calling Agents Module - Deployment Checklist

## Pre-Deployment (Development)

### Database Setup
- [ ] Run migration: `supabase migration up`
- [ ] Verify all 7 tables created in Supabase dashboard
- [ ] Verify RLS policies are enabled
- [ ] Test database connection from app
- [ ] Run sample queries to verify data integrity

### Backend API Testing
- [ ] Test POST /api/ai-agents/start-call locally
- [ ] Test GET /api/ai-agents/calls endpoint
- [ ] Test GET /api/ai-agents/index endpoint
- [ ] Test /api/ai-agents/settings endpoints
- [ ] Test /api/ai-agents/dashboard endpoint
- [ ] Verify webhook receiver at /api/webhooks/ai-agents/indus
- [ ] Test all error handling paths
- [ ] Verify authentication on all protected routes

### Frontend Testing
- [ ] Test all 6 tabs load correctly
- [ ] Test tab navigation works smoothly
- [ ] Test responsive design on mobile
- [ ] Test all forms submit correctly
- [ ] Test filtering on Calls & Evaluations tabs
- [ ] Verify charts render properly
- [ ] Test error states & loading states
- [ ] Test "no data" states

### Settings Configuration
- [ ] Create IndusLabs API key at https://developer.induslabs.io
- [ ] Test Settings tab form
- [ ] Enter test API key
- [ ] Test callback URL format validation
- [ ] Test saving settings to database
- [ ] Verify settings are retrieved correctly

### Evaluation Engine Testing
- [ ] Test evaluateCall() function with various inputs
- [ ] Verify score calculation is correct (0-100)
- [ ] Test issue detection logic
- [ ] Test suggestion generation
- [ ] Test edge cases (no transcript, duration=0, etc.)

### Integration Testing
- [ ] Mock IndusLabs API responses
- [ ] Test full call flow end-to-end
- [ ] Test webhook event handling
- [ ] Test call classification logic
- [ ] Verify database records created correctly
- [ ] Test evaluation triggering on transcript.ready

---

## Staging Deployment

### Environment Setup
- [ ] Deploy to staging environment
- [ ] Update `.env` with staging credentials
- [ ] Verify Supabase connection to staging database
- [ ] Run migrations in staging database
- [ ] Test app loads on staging URL

### Configuration
- [ ] Get staging IndusLabs API key
- [ ] Configure callback URL to staging domain
- [ ] Update webhook callback in IndusLabs dashboard (staging)
- [ ] Test Settings tab saves to staging database
- [ ] Verify API keys are properly secured (not in logs)

### User Acceptance Testing
- [ ] Create test agents in system
- [ ] Test call initiation flow
- [ ] Verify calls appear in Calls tab
- [ ] Test evaluation scoring
- [ ] Verify dashboard metrics update
- [ ] Test filtering & searching
- [ ] Test pagination
- [ ] Load test with multiple concurrent calls

### Monitoring Setup
- [ ] Configure error logging
- [ ] Setup performance monitoring
- [ ] Create dashboard alerts for errors
- [ ] Monitor database query performance
- [ ] Check API response times

---

## Production Deployment

### Pre-Production Checklist
- [ ] Code reviewed and approved
- [ ] All tests passing
- [ ] Security audit completed
- [ ] Performance benchmarks met
- [ ] Staging deployment successful
- [ ] Backup strategy in place
- [ ] Rollback plan documented

### Production Deployment
- [ ] Backup production database
- [ ] Deploy to production
- [ ] Update production `.env` variables
- [ ] Run migrations in production database
- [ ] Verify Supabase connection
- [ ] Clear any cache
- [ ] Monitor error logs

### Post-Deployment Configuration
- [ ] Get production IndusLabs API key
- [ ] Configure production callback URL (https://yourdomain.com/...)
- [ ] Update webhook settings in IndusLabs dashboard
- [ ] Update CORS settings if needed
- [ ] Configure SSL/TLS certificates
- [ ] Enable HTTPS enforcement
- [ ] Test webhook delivery with IndusLabs sandbox

### Production Testing
- [ ] Access module via production URL
- [ ] Test all tabs load correctly
- [ ] Test Settings → enter API key
- [ ] Verify Settings saved to production database
- [ ] Test full call flow with real IndusLabs API
- [ ] Monitor for any errors in logs
- [ ] Test with different browsers
- [ ] Verify mobile responsiveness

### Database Verification
- [ ] Verify all tables have correct schema
- [ ] Verify indexes are created
- [ ] Verify RLS policies are enabled
- [ ] Check database backups working
- [ ] Monitor database size & growth

### Security Hardening
- [ ] Verify API keys are not logged
- [ ] Verify passwords are hashed
- [ ] Verify HTTPS is enforced
- [ ] Check for SQL injection vulnerabilities
- [ ] Verify CORS is properly configured
- [ ] Test authentication on all endpoints
- [ ] Review RLS policies
- [ ] Enable audit logging

---

## Post-Deployment

### Monitoring (First 24 Hours)
- [ ] Monitor error logs continuously
- [ ] Check API performance metrics
- [ ] Monitor database query performance
- [ ] Watch for unusual traffic patterns
- [ ] Monitor webhook delivery success rate
- [ ] Check for 404/500 errors

### Monitoring (First Week)
- [ ] Daily review of error logs
- [ ] Monitor daily active users
- [ ] Track call success rates
- [ ] Verify evaluation accuracy
- [ ] Check database growth rate
- [ ] Review user feedback

### Performance Optimization
- [ ] Analyze slow database queries
- [ ] Optimize indexes if needed
- [ ] Review cache effectiveness
- [ ] Identify N+1 query problems
- [ ] Optimize API response times

### Documentation
- [ ] Update README with production URL
- [ ] Document API endpoints for team
- [ ] Create runbooks for common tasks
- [ ] Document troubleshooting steps
- [ ] Update monitoring & alerting docs

### Team Training
- [ ] Train support team on module
- [ ] Document common issues & solutions
- [ ] Create video tutorials if needed
- [ ] Setup on-call rotation for alerts
- [ ] Document escalation procedures

---

## Rollback Plan

### If Critical Issues Occur
1. [ ] Immediately revert code deployment
2. [ ] Check database for data corruption
3. [ ] Rollback database migration if needed
4. [ ] Update webhook callback to old endpoint
5. [ ] Test all functionality working again
6. [ ] Notify users of status
7. [ ] Post-mortem analysis

### Database Rollback
```sql
-- If migration needs to be reversed:
DROP TABLE IF EXISTS ai_audit_logs;
DROP TABLE IF EXISTS ai_settings;
DROP TABLE IF EXISTS ai_evaluations;
DROP TABLE IF EXISTS ai_transcripts;
DROP TABLE IF EXISTS ai_calls;
DROP TABLE IF EXISTS prompt_versions;
DROP TABLE IF EXISTS ai_agents;
```

---

## Success Criteria

✅ All 6 tabs load without errors
✅ Dashboard shows accurate metrics
✅ Calls can be created successfully
✅ Webhooks received and processed
✅ Evaluations generated automatically
✅ All API endpoints respond in < 500ms
✅ Database queries complete in < 1s
✅ Zero unhandled errors in logs
✅ 99.9% webhook delivery success rate
✅ API keys securely stored

---

## Support & Escalation

### Level 1 - Tier Support
- Module not loading → Check browser console
- Settings not saving → Verify database connection
- API errors → Check API logs

### Level 2 - Engineering Support
- Database issues → Check Supabase dashboard
- Performance issues → Analyze query logs
- Webhook failures → Check IndusLabs logs

### Level 3 - Architecture
- Database schema changes → Contact DBA
- API redesign → Contact Tech Lead
- Integration issues → Contact Integration Team

---

## Continuous Improvement

- [ ] Collect user feedback monthly
- [ ] Review performance metrics weekly
- [ ] Optimize slow operations
- [ ] Update documentation regularly
- [ ] Monitor IndusLabs API changes
- [ ] Plan feature enhancements
- [ ] Security patches & updates
- [ ] Database optimization

---

## Sign-Off

| Role | Name | Date | Status |
|------|------|------|--------|
| QA Lead | | | ⬜ |
| DevOps | | | ⬜ |
| Tech Lead | | | ⬜ |
| Product Manager | | | ⬜ |
| CEO/Director | | | ⬜ |

---

## Notes

Add any important notes or special considerations below:

```
[Space for deployment notes]
```

---

## Timeline

- **Development**: 1-2 weeks
- **Testing**: 1 week
- **Staging**: 2-3 days
- **Production Deploy**: 1 day
- **Post-Deployment Monitoring**: Ongoing

**Total Estimated Timeline**: 3-4 weeks

---

## Contact

For questions or issues during deployment:
- Technical Support: tech-support@company.com
- DevOps Team: devops@company.com
- Product Team: product@company.com
